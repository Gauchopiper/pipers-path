#!/usr/bin/env python3
"""Patch the two inspected existing feedback APIs. Unknown handlers fail closed.
Use a fresh export; does not deploy or copy .clasp.json. Templates are private.
"""
import argparse,pathlib,re,shutil
p=argparse.ArgumentParser();p.add_argument('source',type=pathlib.Path);p.add_argument('output',type=pathlib.Path)
a=p.parse_args();root=pathlib.Path(__file__).resolve().parents[1]
if a.output.exists():p.error('Output must be a new directory')
files=list(a.source.glob('*.js'))+list(a.source.glob('*.gs'))
match=[(f,f.read_text(encoding='utf-8-sig')) for f in files if re.search(r'function submit(?:Pupil)?Feedback\(',f.read_text(encoding='utf-8-sig'))]
if len(match)!=1:p.error('Expected one inspected feedback handler; unknown comment/review handlers require fresh-source integration')
f,code=match[0]
form=(a.source/'FeedbackForm.html').read_text(encoding='utf-8-sig')
if 'getFeedbackOutboxContext' in code:p.error('Already patched')
if len(re.findall(r'<script>',form))!=1 or len(re.findall(r'</script>',form))!=1:p.error('Unknown form script layout')
if 'lock.waitLock(10000)' not in code or 'SpreadsheetApp.flush()' not in code:p.error('Expected durable locked feedback handler')
if 'function submitPupilFeedback(' in code:
 method='submitPupilFeedback'
 anchor="throw Error('Reference conflict.');\n      }"
 conflict="""
      if (row[5] !== fields.category || row[6] !== safeCell_(fields.description) ||
          row[7] !== safeCell_(fields.explanation) || row[8] !== fields.page || row[10] !== fields.browser) {
        throw Error('Operation content conflict.');
      }"""
 if code.count(anchor)!=1:p.error('Unknown pupil duplicate check')
 code=code.replace(anchor,anchor+conflict,1)
 bootstrap="""function getFeedbackOutboxContext(input) {
  const c = feedbackConfig_();
  const ss = SpreadsheetApp.openById(c.localSheetId);
  const id = validateFeedbackPupil_(input, ss);
  return pipersFeedbackContext_(c.organisation, 'pupil', id);
}
"""
else:
 method='submitFeedback'
 anchor="if(row[1]!==c.org || row[2]!==actor.role || row[3]!==feedbackCell_(actor.id)) throw Error('Reference conflict.');"
 if code.count(anchor)!=1 or 'function feedbackActor_(' not in code:p.error('Unknown teacher authorization/duplicate logic; manual integration required')
 code=code.replace(anchor,anchor+"\n      if(row[5]!==fields.category || row[6]!==feedbackCell_(fields.short) || row[7]!==feedbackCell_(fields.long) || row[8]!==fields.page || row[10]!==fields.browser) throw Error('Operation content conflict.');",1)
 bootstrap="""function getFeedbackOutboxContext(input) {
  const c = feedbackConfig_();
  if (Session.getEffectiveUser().getEmail().toLowerCase() !== c.owner) throw Error('Use the feedback deployment.');
  const ss = SpreadsheetApp.openById(c.sheet);
  const actor = feedbackActor_(input, c, ss);
  return pipersFeedbackContext_(c.org, actor.role, actor.id);
}
"""
# An installation-local opaque scope avoids persisting teacher tickets or emails.
bootstrap+='''function pipersFeedbackContext_(org, role, actor) {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    let secret = props.getProperty('OUTBOX_SCOPE_SECRET');
    if (!secret) { secret = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('OUTBOX_SCOPE_SECRET',secret); }
    const scope = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(JSON.stringify([org,role,actor]),secret));
    return {scope:scope,role:role};
  } finally { lock.releaseLock(); }
}
'''
inline='\n'.join((root/x).read_text() for x in ['assets/js/local-outbox.js','assets/js/text-outbox.js','backend/reliability/FeedbackOutboxForm.js']).replace('PIPERS_FEEDBACK_SUBMIT_METHOD',method)
form=re.sub(r'<script>[\s\S]*?</script>',lambda _: '<script>\n'+inline+'\n</script>',form,count=1)
a.output.mkdir()
for source in a.source.iterdir():
 if source.name=='appsscript.json' or source.suffix in ['.js','.gs','.html']:shutil.copyfile(source,a.output/source.name)
(a.output/f.name).write_text(code)
(a.output/'FeedbackOutbox.gs').write_text(bootstrap)
(a.output/'FeedbackForm.html').write_text(form)
print('Prepared feedback adapter. Existing role validation and sanitised access are unchanged. No deployment performed.')
