#!/usr/bin/env python3
"""Create a separate patched Apps Script directory from a fresh owner export.
Never push/deploy, never edit the input export, never copy .clasp.json.
"""
import argparse, pathlib, re, shutil
p=argparse.ArgumentParser()
p.add_argument('source',type=pathlib.Path);p.add_argument('output',type=pathlib.Path)
a=p.parse_args()
if a.output.exists(): p.error('Output must be a new directory')
code=(a.source/'Code.js').read_text(encoding='utf-8-sig')
if len(re.findall(r'function doPost\s*\(',code))!=1: p.error('Expected exactly one doPost; manual review required')
if 'pipersLegacyDoPost_' in code: p.error('Already patched')
workbooks=re.findall(r'function (\w*PupilWorkbook_)\s*\(',code)
if len(workbooks)!=1 or 'function validatePupil_(' not in code: p.error('Unknown configuration/auth adapter; manual review required')
# Require the proven Session ID/read-back path and the documented metadata fix.
for feature in ['sessionId: sessionId', 'SESSION META', 'data.sessionId']:
 if feature not in code: p.error('Missing current recording feature: '+feature)
# The original audio uploader must not acquire the wrapper lock recursively.
body=code[code.index('function doPost('):code.index('function validatePupil_(')]
if 'getScriptLock(' in body: p.error('Uploader already locks; integrate manually')
code=code.replace('function doPost(', 'function pipersLegacyDoPost_(',1)
# Carry the same stable ID through the legacy form transport too.
if 'sessionId: e.parameter.sessionId' not in code:
 marker='durationSeconds: e.parameter.durationSeconds'
 if code.count(marker)!=1:p.error('Unknown form parser; manual review required')
 code=code.replace(marker,marker+',\n        sessionId: e.parameter.sessionId',1)
a.output.mkdir()
# Only code and HTML files are copied; never credentials or backups.
for f in a.source.iterdir():
 if f.name=='appsscript.json' or f.suffix in ['.gs','.js','.html']:
  shutil.copyfile(f,a.output/f.name)
(a.output/'Code.js').write_text(code)
helper=pathlib.Path(__file__).resolve().parents[1]/'backend/reliability/RecordingRecovery.gs'
(a.output/'RecordingRecovery.gs').write_text(helper.read_text()+f'\nfunction pipersRecoveryWorkbook_() {{ return {workbooks[0]}(); }}\nfunction pipersRecoveryValidate_(sheet, pupil, key) {{ return validatePupil_(sheet,pupil,key); }}\n')
print('Prepared separate source. Compare against the current deployment and test before publishing.')
