'use strict';
// Generates a reviewable patch in a VM ONLY. Existing Code.gs is never written.
const fs=require('node:fs'),path=require('node:path');
const SOURCE=path.join(__dirname,'../../apps-script/pupil/Code.gs');
function proposedSource(original=fs.readFileSync(SOURCE,'utf8')){
  const edits=[
    ['function gdbPUpload_(ss,id,d){',`function gdbPUpload_(ss,id,d){return gdbPWriteCore_(ss,id,d,null);}
function gdbPWriteCore_(ss,id,d,trusted){
 if(trusted)gdbGTrusted_(trusted,ss,id);`],
    ["const rule=String(PropertiesService.getScriptProperties().getProperty('GDB_QUALIFY_MINUTES')||'').trim();",
     "const rule=trusted?String(trusted.thresholdSeconds/60):String(PropertiesService.getScriptProperties().getProperty('GDB_QUALIFY_MINUTES')||'').trim();"],
    ["try{\n  const state=gdbPRecordingState_(ss,id,sid);","try{\n  if(trusted)gdbGBefore_(trusted);\n  const state=gdbPRecordingState_(ss,id,sid);"],
    ["DriveApp.getFolderById(gdbPProp_('GDB_PUPIL_RECORDINGS_FOLDER_ID')).createFile(blob)",
     "DriveApp.getFolderById(trusted?trusted.folder:gdbPProp_('GDB_PUPIL_RECORDINGS_FOLDER_ID')).createFile(blob)"]
  ];
  let result=original;for(const [a,b]of edits){if(result.split(a).length!==2)throw Error('Canonical patch anchor changed.');result=result.replace(a,b);}
  return {original,result,edits};
}
module.exports={proposedSource,SOURCE};
