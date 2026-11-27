// Canonical action record; null means the native recorder did not observe it.
export function recordContract(step:any,recordedBy:string,prevStepId:string|null){
  const c=step.capture,d=c?.details;
  const surface=c?.surface==='ax'?'ax':'uia';
  const state=(s:any,field:string)=>s?{...s,urlPattern:null,[field]:[]}:null;
 return {schemaVersion:1,stepId:step.stepId,sessionId:step.recordingId,seq:step.seq,prevStepId,nextStepId:null,prerequisites:[],ts:step.timestamp,
 event:{type:step.event,button:step.button||(['click','doubleClick'].includes(step.event)?'left':step.event==='rightClick'?'right':null),modifiers:step.modifiers||[],key:step.key||null,typedText:null,typedTextSensitive:step.event==='type',scrollDelta:step.scrollDelta||null,motion:step.motion||null},
  target:{surface,window:{process:step.window.process,className:null,titlePattern:null,appVersion:d?.appVersion||null},web:{urlPattern:null,frames:[],shadowRoots:[],cssPath:null,xpath:null,testId:null,domId:null},
 element:{automationId:step.target.automationId||null,role:step.target.controlType,name:step.target.name,namePattern:null,text:null,className:d?.className||null,state:{enabled:d?.enabled??null,selected:null,expanded:null,checked:null},indexInParent:null,supportedPatterns:d?.supportedPatterns||[]},ancestors:d?.ancestors||[],scrollContainer:null,bboxNorm:d?.bboxNorm||null},
 context:{windowTitle:step.window.title,preState:state(c?.preState,'requiredElements'),postState:state(c?.postState,'expectedElements')},
 semantics:{intent:[step.event,step.target.name||step.target.automationId,step.window.process].join(' '),section:'',tags:[],embeddingRef:null},
 evidence:{screenshotRef:null,elementCropRef:null,ocrNearby:[]},env:c?{...c.env,theme:null}:null,
  meta:{recordedBy,recorderVersion:null,reviewed:false,redactions:['typedText','passwordElements'],capabilities:[surface,'observed-state'],unsupported:['web-selectors','visual-locators','inferred-prerequisites']},
 health:{replaySuccesses:0,replayFailures:0,lastStrategyUsed:null,lastVerifiedAt:null}};
}
