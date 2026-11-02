BEGIN;
-- INACTIVE OFFLINE CANDIDATE. Only install in a disposable fixture database.
-- No credentials, network setup, operational resource IDs or Google calls.
-- Bootstrap caller must be a disposable provisioner. Runtime roles are NOT owners.
CREATE ROLE gdbj_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE gdbj_gateway LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE gdbj_worker LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE gdbj_reader LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE gdbj_admission LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE gdbj_recovery LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE gdbj_verifier LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE gdbj_coordinator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE gdbj_backup LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE gdbj_migration LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
DO $b$ BEGIN EXECUTE format('ALTER DATABASE %I OWNER TO gdbj_owner',current_database());
 EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC',current_database());
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO gdbj_gateway,gdbj_worker,gdbj_reader,gdbj_admission,gdbj_recovery,gdbj_verifier,gdbj_coordinator,gdbj_backup,gdbj_migration',current_database()); END $b$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT gdbj_owner TO gdbj_migration;
CREATE SCHEMA gdbj AUTHORIZATION gdbj_owner;
REVOKE ALL ON SCHEMA gdbj FROM PUBLIC;
GRANT USAGE ON SCHEMA gdbj TO gdbj_gateway,gdbj_worker,gdbj_reader,gdbj_admission,gdbj_recovery,gdbj_verifier,gdbj_coordinator,gdbj_backup;
SET ROLE gdbj_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA gdbj REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA gdbj REVOKE ALL ON TABLES FROM PUBLIC;
CREATE TABLE gdbj.binding(id boolean PRIMARY KEY CHECK(id),environment text UNIQUE NOT NULL,profile text NOT NULL CHECK(profile ~ '^[a-f0-9]{64}$'),actor text NOT NULL,pupil uuid NOT NULL,session uuid NOT NULL);
CREATE TABLE gdbj.policy(id boolean PRIMARY KEY REFERENCES gdbj.binding(id),revision bigint NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'inactive' CHECK(status IN ('active','inactive','revoked')),expires timestamptz NOT NULL DEFAULT '-infinity',ops jsonb NOT NULL DEFAULT '[]');
CREATE TABLE gdbj.revision(id boolean PRIMARY KEY REFERENCES gdbj.binding(id),n bigint NOT NULL DEFAULT 0,dirty uuid,credits integer NOT NULL DEFAULT 0);
CREATE TABLE gdbj.jobs(sid uuid PRIMARY KEY,manifest jsonb NOT NULL,manifest_hash text UNIQUE NOT NULL,operation uuid UNIQUE NOT NULL,base_revision bigint NOT NULL,admission_revision bigint NOT NULL,
 phase text NOT NULL CHECK(phase IN ('queued','leased','sent','attention','confirmed')),worker text,fence bigint NOT NULL DEFAULT 0,lease timestamptz,cipher jsonb NOT NULL,receipt jsonb);
CREATE TABLE gdbj.nonces(nonce uuid PRIMARY KEY,purpose text NOT NULL,digest text NOT NULL);
CREATE TABLE gdbj.reads(id uuid PRIMARY KEY,handle text UNIQUE NOT NULL,client uuid NOT NULL,op text NOT NULL,sid uuid,access_revision bigint NOT NULL,version bigint NOT NULL,expires timestamptz NOT NULL,state text NOT NULL CHECK(state IN ('pending','dispatched','ready','consumed')),request_digest text,proof_digest text,cipher jsonb);
CREATE TABLE gdbj.operations(id uuid PRIMARY KEY,event text NOT NULL,digest text NOT NULL,state text NOT NULL CHECK(state IN ('dirty','complete')),proof_digest text);
CREATE TABLE gdbj.recovery(sid uuid PRIMARY KEY REFERENCES gdbj.jobs(sid),requested timestamptz NOT NULL DEFAULT clock_timestamp());
-- Fixed common binding, strict JSON and narrow internal lock helpers.
CREATE FUNCTION gdbj.shape(q jsonb,fields text[]) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $b$
 BEGIN IF jsonb_typeof(q) IS DISTINCT FROM 'object' OR octet_length(q::text)>1048576 OR
 (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(q) k) IS DISTINCT FROM (SELECT array_agg(k ORDER BY k) FROM unnest(fields) k)
 THEN RAISE EXCEPTION 'request shape rejected'; END IF; END $b$;
CREATE FUNCTION gdbj.num(q jsonb,k text) RETURNS bigint LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE n numeric; BEGIN IF jsonb_typeof(q->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'numeric type rejected'; END IF;
 n:=(q->>k)::numeric; IF n<>trunc(n) OR n<0 OR n>9007199254740991 THEN RAISE EXCEPTION 'numeric bounds rejected'; END IF; RETURN n::bigint; END $b$;
CREATE FUNCTION gdbj.txt(q jsonb,k text) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $b$
 BEGIN IF jsonb_typeof(q->k) IS DISTINCT FROM 'string' OR length(q->>k) NOT BETWEEN 1 AND 256 THEN RAISE EXCEPTION 'text rejected'; END IF; RETURN q->>k; END $b$;
CREATE FUNCTION gdbj.h(q jsonb,k text) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE v text:=gdbj.txt(q,k); BEGIN IF v !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'digest rejected'; END IF; RETURN v; END $b$;
CREATE FUNCTION gdbj.scope(q jsonb,extra text[]) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE b gdbj.binding; BEGIN PERFORM gdbj.shape(q,ARRAY['environment','profile','actor','pupil']||extra); SELECT * INTO STRICT b FROM gdbj.binding WHERE id;
 IF gdbj.txt(q,'environment')<>b.environment OR gdbj.h(q,'profile')<>b.profile OR gdbj.txt(q,'actor')<>b.actor OR gdbj.txt(q,'pupil')<>b.pupil::text THEN RAISE EXCEPTION 'foreign binding'; END IF; END $b$;
CREATE FUNCTION gdbj.authority(who text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $b$
 BEGIN IF session_user::text<>who THEN RAISE EXCEPTION 'service identity rejected'; END IF; END $b$;
CREATE FUNCTION gdbj.lock_policy() RETURNS gdbj.policy LANGUAGE sql SET search_path=pg_catalog,pg_temp AS $b$ SELECT p FROM gdbj.policy p WHERE id FOR UPDATE $b$;
CREATE FUNCTION gdbj.lock_revision() RETURNS gdbj.revision LANGUAGE sql SET search_path=pg_catalog,pg_temp AS $b$ SELECT r FROM gdbj.revision r WHERE id FOR UPDATE $b$;
CREATE FUNCTION gdbj.admit(op text) RETURNS gdbj.policy LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE p gdbj.policy; BEGIN p:=gdbj.lock_policy(); IF p.status<>'active' OR p.expires<=clock_timestamp() OR NOT p.ops ? op THEN RAISE EXCEPTION 'admission denied'; END IF; RETURN p; END $b$;
CREATE FUNCTION gdbj.encrypted(q jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $b$
 BEGIN PERFORM gdbj.shape(q,ARRAY['iv','tag','bytes']); IF gdbj.txt(q,'iv') !~ '^[a-f0-9]{24}$' OR gdbj.txt(q,'tag') !~ '^[a-f0-9]{32}$' OR jsonb_typeof(q->'bytes') IS DISTINCT FROM 'string' OR length(q->>'bytes') NOT BETWEEN 2 AND 524288 OR (q->>'bytes') !~ '^([a-f0-9]{2})+$' THEN RAISE EXCEPTION 'cipher rejected'; END IF; END $b$;
CREATE FUNCTION gdbj.set_admission(q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE p gdbj.policy; r gdbj.revision; n bigint;
 BEGIN PERFORM gdbj.authority('gdbj_admission'); PERFORM gdbj.scope(q,ARRAY['expected','status','ttl','operations']::text[]);
 p:=gdbj.lock_policy(); r:=gdbj.lock_revision(); n:=gdbj.num(q,'ttl');
 IF gdbj.num(q,'expected')<>p.revision OR gdbj.txt(q,'status') NOT IN ('active','inactive','revoked') OR n>300 OR jsonb_typeof(q->'operations') IS DISTINCT FROM 'array' OR jsonb_array_length(q->'operations')>4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(q->'operations') x WHERE jsonb_typeof(x)<>'string' OR x#>>'{}' NOT IN ('recording.submit','recording.status','path.read','playback.read')) THEN RAISE EXCEPTION 'policy CAS rejected'; END IF;
 UPDATE gdbj.policy SET revision=revision+1,status=q->>'status',expires=clock_timestamp()+n*interval '1 second',ops=q->'operations' WHERE id;
 UPDATE gdbj.revision SET n=gdbj.revision.n+1 WHERE id; RETURN jsonb_build_object('revision',p.revision+1);
 END $b$;
CREATE FUNCTION gdbj.submit_original(q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE p gdbj.policy; r gdbj.revision; b gdbj.binding; j gdbj.jobs; m jsonb;
 BEGIN PERFORM gdbj.authority('gdbj_gateway'); PERFORM gdbj.scope(q,ARRAY['sid','manifest','manifestHash','operation','cipher']::text[]);
 p:=gdbj.admit('recording.submit'); r:=gdbj.lock_revision(); SELECT * INTO STRICT b FROM gdbj.binding WHERE id;
 IF gdbj.txt(q,'sid')<>b.session::text THEN RAISE EXCEPTION 'foreign session'; END IF; m:=q->'manifest';
 PERFORM gdbj.shape(m,ARRAY['organisation','environment','profile','pupil','actor','session','hash','length','mime','seconds','start','end']);
 IF gdbj.txt(m,'organisation')<>'GDB' OR gdbj.txt(m,'environment')<>b.environment OR gdbj.h(m,'profile')<>b.profile OR gdbj.txt(m,'pupil')<>b.pupil::text OR gdbj.txt(m,'actor')<>b.actor OR gdbj.txt(m,'session')<>b.session::text OR gdbj.txt(m,'mime') NOT IN ('audio/wav','audio/webm') OR gdbj.num(m,'length') NOT BETWEEN 1 AND 262144 OR jsonb_typeof(m->'seconds') IS DISTINCT FROM 'number' OR (m->>'seconds')::numeric<=0 OR (m->>'seconds')::numeric>3600 OR (gdbj.txt(m,'end'))::timestamptz<=(gdbj.txt(m,'start'))::timestamptz THEN RAISE EXCEPTION 'manifest rejected'; END IF;
 PERFORM gdbj.h(m,'hash'); PERFORM gdbj.encrypted(q->'cipher'); PERFORM gdbj.h(q,'manifestHash');
 SELECT * INTO j FROM gdbj.jobs WHERE sid=b.session FOR UPDATE;
 IF FOUND THEN IF j.manifest<>m OR j.manifest_hash<>q->>'manifestHash' OR j.operation<>(gdbj.txt(q,'operation'))::uuid THEN RAISE EXCEPTION 'immutable original conflict'; END IF; RETURN jsonb_build_object('state',j.phase); END IF;
 IF r.dirty IS NOT NULL THEN RAISE EXCEPTION 'dirty'; END IF;
 INSERT INTO gdbj.jobs(sid,manifest,manifest_hash,operation,base_revision,admission_revision,phase,cipher) VALUES(b.session,m,q->>'manifestHash',(q->>'operation')::uuid,r.n,p.revision,'queued',q->'cipher'); RETURN jsonb_build_object('state','queued');
 END $b$;
CREATE FUNCTION gdbj.recording_status(q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE j gdbj.jobs;
 BEGIN PERFORM gdbj.authority('gdbj_gateway'); PERFORM gdbj.scope(q,ARRAY['sid']::text[]);
 PERFORM gdbj.admit('recording.status'); SELECT * INTO STRICT j FROM gdbj.jobs WHERE sid=(gdbj.txt(q,'sid'))::uuid;
 RETURN jsonb_build_object('state',j.phase,'saved',j.phase='confirmed','manifest',j.manifest,'manifestHash',j.manifest_hash,'receipt',CASE WHEN j.phase='confirmed' THEN j.receipt ELSE NULL END);
 END $b$;
CREATE FUNCTION gdbj.claim_recording(q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE p gdbj.policy; r gdbj.revision; j gdbj.jobs;
 BEGIN PERFORM gdbj.authority('gdbj_worker'); PERFORM gdbj.scope(q,ARRAY[]::text[]);
 p:=gdbj.admit('recording.submit'); r:=gdbj.lock_revision(); IF r.dirty IS NOT NULL THEN RAISE EXCEPTION 'dirty'; END IF;
 SELECT * INTO j FROM gdbj.jobs WHERE phase='queued' OR (phase='leased' AND lease<=clock_timestamp()) ORDER BY sid FOR UPDATE SKIP LOCKED LIMIT 1; IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;
 UPDATE gdbj.jobs SET phase='leased',worker=session_user,fence=fence+1,lease=clock_timestamp()+interval '2 seconds' WHERE sid=j.sid RETURNING * INTO j;
 RETURN jsonb_build_object('sid',j.sid,'fence',j.fence,'manifestHash',j.manifest_hash,'lease',j.lease);
 END $b$;
CREATE FUNCTION gdbj.arm_recording(q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE p gdbj.policy; r gdbj.revision; j gdbj.jobs;
 BEGIN PERFORM gdbj.authority('gdbj_worker'); PERFORM gdbj.scope(q,ARRAY['sid','fence','manifestHash']::text[]);
 p:=gdbj.admit('recording.submit'); r:=gdbj.lock_revision(); SELECT * INTO STRICT j FROM gdbj.jobs WHERE sid=(gdbj.txt(q,'sid'))::uuid FOR UPDATE;
 IF j.phase<>'leased' OR j.worker<>session_user::text OR j.fence<>gdbj.num(q,'fence') OR j.lease<=clock_timestamp() OR j.manifest_hash<>gdbj.h(q,'manifestHash') OR r.dirty IS NOT NULL OR r.n<>j.base_revision OR p.revision<>j.admission_revision THEN RAISE EXCEPTION 'stale dispatch'; END IF;
 UPDATE gdbj.jobs SET phase='sent' WHERE sid=j.sid; UPDATE gdbj.revision SET dirty=j.operation WHERE id;
 RETURN jsonb_build_object('manifest',j.manifest,'cipher',j.cipher,'manifestHash',j.manifest_hash,'operation',j.operation,'fence',j.fence,'admissionRevision',p.revision,'baseRevision',r.n);
 END $b$;
CREATE FUNCTION gdbj.mark_attention(q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE j gdbj.jobs;
 BEGIN PERFORM gdbj.authority('gdbj_worker'); PERFORM gdbj.scope(q,ARRAY['sid','fence']::text[]);
 PERFORM gdbj.lock_policy(); PERFORM gdbj.lock_revision(); SELECT * INTO STRICT j FROM gdbj.jobs WHERE sid=(gdbj.txt(q,'sid'))::uuid FOR UPDATE;
 IF j.phase NOT IN ('sent','attention') OR j.worker<>session_user::text OR j.fence<>gdbj.num(q,'fence') THEN RAISE EXCEPTION 'attention denied'; END IF;
 UPDATE gdbj.jobs SET phase='attention' WHERE sid=j.sid; RETURN jsonb_build_object('state','attention');
 END $b$;
CREATE FUNCTION gdbj.confirm_source_receipt(q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE j gdbj.jobs; r gdbj.revision; v jsonb; b gdbj.binding;
 BEGIN PERFORM gdbj.authority('gdbj_verifier'); PERFORM gdbj.scope(q,ARRAY['sid','receipt','nonce','proofDigest']::text[]);
 PERFORM gdbj.lock_policy(); r:=gdbj.lock_revision(); SELECT * INTO STRICT j FROM gdbj.jobs WHERE sid=(gdbj.txt(q,'sid'))::uuid FOR UPDATE; v:=q->'receipt'; SELECT * INTO STRICT b FROM gdbj.binding WHERE id;
 PERFORM gdbj.shape(v,ARRAY['manifest','manifestHash','operation','baseRevision','admissionRevision','threshold','qualifying','fileDigest','logDigest','metaDigest','sourceProof']);
 IF v->'manifest' IS DISTINCT FROM j.manifest OR gdbj.h(v,'manifestHash')<>j.manifest_hash OR (gdbj.txt(v,'operation'))::uuid<>j.operation OR gdbj.num(v,'baseRevision')<>j.base_revision OR gdbj.num(v,'admissionRevision')<j.admission_revision OR gdbj.num(v,'threshold')<>300 OR jsonb_typeof(v->'qualifying') IS DISTINCT FROM 'boolean' OR (v->>'qualifying')::boolean<>((j.manifest->>'seconds')::numeric>=300) OR gdbj.h(v,'fileDigest')<>j.manifest->>'hash' OR jsonb_typeof(v->'sourceProof') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'receipt conflict'; END IF;
 PERFORM gdbj.h(v,'logDigest'); PERFORM gdbj.h(v,'metaDigest'); PERFORM gdbj.h(q,'proofDigest');
 IF j.phase='confirmed' THEN IF j.receipt<>v THEN RAISE EXCEPTION 'conflicting duplicate'; END IF; RETURN jsonb_build_object('saved',true); END IF;
 IF j.phase NOT IN ('sent','attention') OR r.dirty IS DISTINCT FROM j.operation THEN RAISE EXCEPTION 'no original dispatch'; END IF;
 INSERT INTO gdbj.nonces VALUES((gdbj.txt(q,'nonce'))::uuid,'receipt',q->>'proofDigest');
 UPDATE gdbj.jobs SET phase='confirmed',receipt=v WHERE sid=j.sid;
 UPDATE gdbj.revision SET n=n+1,dirty=NULL,credits=credits+CASE WHEN (v->>'qualifying')::boolean THEN 1 ELSE 0 END WHERE id;
 RETURN jsonb_build_object('saved',true);
 END $b$;
CREATE FUNCTION gdbj.request_reconciliation(q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE j gdbj.jobs;
 BEGIN PERFORM gdbj.authority('gdbj_recovery'); PERFORM gdbj.scope(q,ARRAY['sid']::text[]);
 PERFORM gdbj.lock_policy(); PERFORM gdbj.lock_revision(); SELECT * INTO STRICT j FROM gdbj.jobs WHERE sid=(gdbj.txt(q,'sid'))::uuid FOR UPDATE;
 IF j.phase NOT IN ('sent','attention','confirmed') THEN RAISE EXCEPTION 'no dispatch'; END IF;
 INSERT INTO gdbj.recovery(sid) VALUES(j.sid) ON CONFLICT DO NOTHING; RETURN jsonb_build_object('manifest',j.manifest,'manifestHash',j.manifest_hash,'operation',j.operation,'state',j.phase);
 END $b$;
CREATE FUNCTION gdbj.create_read(q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE p gdbj.policy; r gdbj.revision; b gdbj.binding; o text;
 BEGIN PERFORM gdbj.authority('gdbj_reader'); PERFORM gdbj.scope(q,ARRAY['id','handle','client','operation','sid']::text[]);
 o:=gdbj.txt(q,'operation'); IF o NOT IN ('path.read','playback.read') THEN RAISE EXCEPTION 'read operation'; END IF;
 p:=gdbj.admit(o); r:=gdbj.lock_revision(); SELECT * INTO STRICT b FROM gdbj.binding WHERE id;
 IF r.dirty IS NOT NULL OR (o='path.read' AND q->'sid'<>'null'::jsonb) OR (o='playback.read' AND gdbj.txt(q,'sid')<>b.session::text) THEN RAISE EXCEPTION 'read denied'; END IF;
 INSERT INTO gdbj.reads VALUES((gdbj.txt(q,'id'))::uuid,gdbj.h(q,'handle'),(gdbj.txt(q,'client'))::uuid,o,(q->>'sid')::uuid,p.revision,r.n,clock_timestamp()+interval '30 seconds','pending',NULL,NULL,NULL); RETURN jsonb_build_object('id',q->>'id');
 END $b$;
CREATE FUNCTION gdbj.read_check(x gdbj.reads,p gdbj.policy,r gdbj.revision) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $b$
 BEGIN IF p.status<>'active' OR p.expires<=clock_timestamp() OR NOT p.ops ? x.op OR r.dirty IS NOT NULL OR x.version<>r.n OR x.access_revision<>p.revision OR x.expires<=clock_timestamp() THEN RAISE EXCEPTION 'stale read'; END IF; END $b$;
CREATE FUNCTION gdbj.dispatch_read(q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE p gdbj.policy; r gdbj.revision; x gdbj.reads;
 BEGIN PERFORM gdbj.authority('gdbj_worker'); PERFORM gdbj.scope(q,ARRAY['id','handle','requestDigest']::text[]);
 p:=gdbj.lock_policy(); r:=gdbj.lock_revision(); SELECT * INTO STRICT x FROM gdbj.reads WHERE id=(gdbj.txt(q,'id'))::uuid FOR UPDATE;
 PERFORM gdbj.read_check(x,p,r); IF x.state<>'pending' OR x.handle<>gdbj.h(q,'handle') THEN RAISE EXCEPTION 'handle replay'; END IF;
 UPDATE gdbj.reads SET state='dispatched',request_digest=gdbj.h(q,'requestDigest') WHERE id=x.id;
 RETURN jsonb_build_object('id',x.id,'client',x.client,'operation',x.op,'sid',x.sid,'version',x.version,'admissionRevision',x.access_revision);
 END $b$;
CREATE FUNCTION gdbj.stage_verified_read(q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE p gdbj.policy; r gdbj.revision; x gdbj.reads;
 BEGIN PERFORM gdbj.authority('gdbj_verifier'); PERFORM gdbj.scope(q,ARRAY['id','requestDigest','proofDigest','cipher']::text[]);
 p:=gdbj.lock_policy(); r:=gdbj.lock_revision(); SELECT * INTO STRICT x FROM gdbj.reads WHERE id=(gdbj.txt(q,'id'))::uuid FOR UPDATE;
 PERFORM gdbj.read_check(x,p,r); PERFORM gdbj.encrypted(q->'cipher'); IF x.request_digest IS DISTINCT FROM gdbj.h(q,'requestDigest') OR x.state NOT IN ('dispatched','ready') THEN RAISE EXCEPTION 'read proof conflict'; END IF;
 IF x.state='ready' THEN IF x.proof_digest<>gdbj.h(q,'proofDigest') OR x.cipher<>q->'cipher' THEN RAISE EXCEPTION 'callback conflict'; END IF; RETURN jsonb_build_object('ack',x.id); END IF;
 UPDATE gdbj.reads SET state='ready',proof_digest=gdbj.h(q,'proofDigest'),cipher=q->'cipher' WHERE id=x.id; RETURN jsonb_build_object('ack',x.id);
 END $b$;
CREATE FUNCTION gdbj.release_read(q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE p gdbj.policy; r gdbj.revision; x gdbj.reads;
 BEGIN PERFORM gdbj.authority('gdbj_reader'); PERFORM gdbj.scope(q,ARRAY['id','client']::text[]);
 p:=gdbj.lock_policy(); r:=gdbj.lock_revision(); SELECT * INTO STRICT x FROM gdbj.reads WHERE id=(gdbj.txt(q,'id'))::uuid FOR UPDATE; PERFORM gdbj.read_check(x,p,r);
 IF x.state<>'ready' OR x.client<>(gdbj.txt(q,'client'))::uuid THEN RAISE EXCEPTION 'release denied'; END IF;
 UPDATE gdbj.reads SET state='consumed',cipher=NULL WHERE id=x.id; RETURN jsonb_build_object('cipher',x.cipher,'proofDigest',x.proof_digest,'requestDigest',x.request_digest,'operation',x.op,'sid',x.sid,'version',x.version,'admissionRevision',x.access_revision);
 END $b$;
CREATE FUNCTION gdbj.begin_revision(q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE p gdbj.policy; r gdbj.revision; o gdbj.operations;
 BEGIN PERFORM gdbj.authority('gdbj_coordinator'); PERFORM gdbj.scope(q,ARRAY['operation','event','requestDigest']::text[]);
 p:=gdbj.admit('path.read'); r:=gdbj.lock_revision(); IF gdbj.txt(q,'event') NOT IN ('teacher.comment','teacher.review','target.assign','target.change','badge.award','badge.change','session.target','permission.change') THEN RAISE EXCEPTION 'event denied'; END IF;
 SELECT * INTO o FROM gdbj.operations WHERE id=(gdbj.txt(q,'operation'))::uuid FOR UPDATE;
 IF FOUND THEN IF o.digest<>gdbj.h(q,'requestDigest') OR o.event<>q->>'event' THEN RAISE EXCEPTION 'revision conflict'; END IF; RETURN jsonb_build_object('state',o.state); END IF;
 IF r.dirty IS NOT NULL THEN RAISE EXCEPTION 'dirty'; END IF;
 INSERT INTO gdbj.operations VALUES((q->>'operation')::uuid,q->>'event',gdbj.h(q,'requestDigest'),'dirty',NULL); UPDATE gdbj.revision SET dirty=(q->>'operation')::uuid WHERE id; RETURN jsonb_build_object('state','dirty');
 END $b$;
CREATE FUNCTION gdbj.finish_revision(q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE r gdbj.revision; o gdbj.operations;
 BEGIN PERFORM gdbj.authority('gdbj_verifier'); PERFORM gdbj.scope(q,ARRAY['operation','requestDigest','proofDigest','nonce']::text[]);
 PERFORM gdbj.lock_policy(); r:=gdbj.lock_revision(); SELECT * INTO STRICT o FROM gdbj.operations WHERE id=(gdbj.txt(q,'operation'))::uuid FOR UPDATE;
 IF o.digest<>gdbj.h(q,'requestDigest') THEN RAISE EXCEPTION 'operation proof mismatch'; END IF;
 IF o.state='complete' THEN IF o.proof_digest<>gdbj.h(q,'proofDigest') THEN RAISE EXCEPTION 'proof conflict'; END IF; RETURN jsonb_build_object('state','complete'); END IF;
 IF r.dirty IS DISTINCT FROM o.id THEN RAISE EXCEPTION 'dirty mismatch'; END IF;
 INSERT INTO gdbj.nonces VALUES((gdbj.txt(q,'nonce'))::uuid,'revision',gdbj.h(q,'proofDigest'));
 UPDATE gdbj.operations SET state='complete',proof_digest=q->>'proofDigest' WHERE id=o.id; UPDATE gdbj.revision SET dirty=NULL,n=n+1 WHERE id; RETURN jsonb_build_object('state','complete');
 END $b$;
CREATE FUNCTION gdbj.verification_context(q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $b$
 DECLARE p gdbj.policy; r gdbj.revision; j gdbj.jobs;
 BEGIN PERFORM gdbj.authority('gdbj_verifier'); PERFORM gdbj.scope(q,ARRAY[]::text[]);
 p:=gdbj.lock_policy(); r:=gdbj.lock_revision(); SELECT * INTO j FROM gdbj.jobs;
 RETURN jsonb_build_object('policy',to_jsonb(p),'revision',to_jsonb(r),'job',CASE WHEN j.sid IS NULL THEN NULL ELSE to_jsonb(j)-'cipher' END,'reads',COALESCE((SELECT jsonb_agg(to_jsonb(x)-'cipher') FROM gdbj.reads x),'[]'::jsonb)); END $b$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA gdbj FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA gdbj FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gdbj.set_admission(jsonb) TO gdbj_admission;
GRANT EXECUTE ON FUNCTION gdbj.submit_original(jsonb) TO gdbj_gateway;
GRANT EXECUTE ON FUNCTION gdbj.recording_status(jsonb) TO gdbj_gateway;
GRANT EXECUTE ON FUNCTION gdbj.claim_recording(jsonb) TO gdbj_worker;
GRANT EXECUTE ON FUNCTION gdbj.arm_recording(jsonb) TO gdbj_worker;
GRANT EXECUTE ON FUNCTION gdbj.mark_attention(jsonb) TO gdbj_worker;
GRANT EXECUTE ON FUNCTION gdbj.confirm_source_receipt(jsonb) TO gdbj_verifier;
GRANT EXECUTE ON FUNCTION gdbj.request_reconciliation(jsonb) TO gdbj_recovery;
GRANT EXECUTE ON FUNCTION gdbj.create_read(jsonb) TO gdbj_reader;
GRANT EXECUTE ON FUNCTION gdbj.dispatch_read(jsonb) TO gdbj_worker;
GRANT EXECUTE ON FUNCTION gdbj.stage_verified_read(jsonb) TO gdbj_verifier;
GRANT EXECUTE ON FUNCTION gdbj.release_read(jsonb) TO gdbj_reader;
GRANT EXECUTE ON FUNCTION gdbj.begin_revision(jsonb) TO gdbj_coordinator;
GRANT EXECUTE ON FUNCTION gdbj.finish_revision(jsonb) TO gdbj_verifier;
GRANT SELECT ON gdbj.binding,gdbj.policy,gdbj.revision,gdbj.jobs,gdbj.nonces,gdbj.reads,gdbj.operations,gdbj.recovery TO gdbj_backup;
RESET ROLE;
GRANT EXECUTE ON FUNCTION gdbj.verification_context(jsonb) TO gdbj_verifier;

COMMIT;
