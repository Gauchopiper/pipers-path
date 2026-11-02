/* EMGT-only integration. Credentials remain in memory and existing requests. */
let recordingOutboxPromise=null, journal=null, recorder=null, lastObjectUrl=null;
const recordButton=document.getElementById('recordButton');
const statusEl=document.getElementById('status');
const timerEl=document.getElementById('timer');
const playbackWrap=document.getElementById('playbackWrap');
const playback=document.getElementById('playback');
const es=uiLanguage==='ES';
const reliabilityText=es ? {
  starting:'Preparando el micrófono…', stopping:'Terminando la grabación…', checking:'Comprobando y guardando el audio…',
  interrupted:'La grabación se interrumpió o contiene menos audio que el tiempo del reloj. Se conserva el audio capturado.',
  retained:'El audio necesita revisión. Mantén esta página abierta y descarga una copia. No se ha confirmado el envío.',
  recovery:'Audio conservado de una grabación anterior (puede estar incompleto).', download:'Descargar una copia',
  unsupported:'Este navegador no permite grabar audio.', storage:'No se puede proteger el audio en este dispositivo. Descarga una copia.'
} : {
  starting:'Preparing the microphone…', stopping:'Finishing recording…', checking:'Checking and saving audio…',
  interrupted:'Recording was interrupted or contains less audio than the timer. Captured audio is retained.',
  retained:'Audio needs review. Keep this page open and download a copy. Upload is not confirmed.',
  recovery:'Audio retained from an earlier recording (may be incomplete).', download:'Download a copy',
  unsupported:'This browser does not support audio recording.', storage:'Audio cannot be protected on this device. Download a copy.'
};
function blobToBase64(blob) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1]);
    reader.onerror=()=>reject(reader.error); reader.readAsDataURL(blob);
  });
}
function exportAudio(blob,context,message) {
  const row=document.createElement('p'), button=document.createElement('button');
  row.textContent=message+' '; button.type='button'; button.textContent=reliabilityText.download;
  button.onclick=()=>PipersOutbox.download({id:context.sessionId||context.id,kind:'audio',data:{blob}});
  row.append(button); document.getElementById('recordView').append(row);
}
function getRecordingOutbox() {
  if (!recordingOutboxPromise) recordingOutboxPromise=createRecordingOutbox({
    endpoint:emgtBackendUrl_(),pupilId,accessKey,language:es?'es':'en',
    parent:document.getElementById('recordView'),
    status:message=>{if (!recorder || recorder.state==='idle') statusEl.textContent=message;},
    toBase64:blobToBase64,readPath:()=>getPathWithRetry(2),tagTarget:tagSavedRecording
  }).catch(e=>{recordingOutboxPromise=null;throw e;});
  return recordingOutboxPromise;
}
async function initializeRecorder() {
  recordButton.disabled=true;
  if (!pupilId || !accessKey) { statusEl.textContent=t.recordingNoPupilLink;return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) { statusEl.textContent=reliabilityText.unsupported;return; }
  try {
    const outbox=await getRecordingOutbox();
    journal=await new EMGTCaptureStore().open(outbox.queue.store.scope);
    // Export-only recovery cannot duplicate or replace a live take in another tab.
    // Keep source chunks until a later owner-assisted reconciliation.
    for (const context of await journal.list()) {
      const raw=await journal.blob(context.id,context.mimeType);
      if (raw && raw.size) exportAudio(raw,context,reliabilityText.recovery);
    }
    recorder=new EMGTRecorder({
      journal,target:()=>practiceTarget.value,
      timer:seconds=>{timerEl.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');},
      state:state=>{
        recordButton.disabled=!['idle','recording'].includes(state);
        recordButton.textContent=state==='recording'?t.stopButton:t.recordButton;
        recordButton.classList.toggle('recording',state==='recording');
        practiceTarget.disabled=state!=='idle';
        if (state==='recording') statusEl.textContent=t.recordingNow;
        else if (reliabilityText[state]) statusEl.textContent=reliabilityText[state];
      },
      warning:kind=>{
        // Persistent notice remains visible if the queue later confirms saving.
        const note=document.createElement('p'); note.className='warning';
        note.textContent=reliabilityText[kind]; document.getElementById('recordView').append(note);
      },
      error:e=>{statusEl.textContent=e.name==='NotAllowedError'?t.microphoneDenied:t.microphoneStartFailed;},
      preview:blob=>{
        if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
        lastObjectUrl=URL.createObjectURL(blob); playback.src=lastObjectUrl; playbackWrap.style.display='block';
      },
      protect:async(blob,context)=>{
        await outbox.protect(blob,context);
        statusEl.textContent=PipersOutbox.messages[es?'es':'en'].pending;
      },
      retain:(blob,context)=>{
        statusEl.textContent=reliabilityText.retained;
        exportAudio(blob,context,reliabilityText.retained);
      }
    });
    recordButton.disabled=false;
  } catch (_) {statusEl.textContent=reliabilityText.storage;}
}
recordButton.addEventListener('click',()=>{
  if (!recorder) return;
  if (recorder.state==='recording') recorder.stop(); else recorder.start();
});
window.addEventListener('beforeunload',e=>{
  if (recorder && recorder.state!=='idle') {e.preventDefault();e.returnValue='';}
});
// Stop and flush while the page still has execution time. Mobile OS termination
// can still lose the last unflushed chunk; a web page cannot prevent that.
document.addEventListener('visibilitychange',()=>{
  if (document.hidden && recorder) recorder.stop(true);
});
window.addEventListener('pagehide',()=>{if(recorder)recorder.stop(true);});
initializeRecorder();
