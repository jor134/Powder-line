/* headless harness: loads the real game script with stubbed THREE + DOM */
const fs=require("fs"),vm=require("vm");
const html=fs.readFileSync("index.html","utf8");
const m=html.match(/<script>\n([\s\S]*?)<\/script>/);
if(!m) throw new Error("game script not found");
const code=m[1];

class V3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  copy(v){return this.set(v.x,v.y,v.z);}
  clone(){return new V3(this.x,this.y,this.z);}
  add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
  multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
  length(){return Math.hypot(this.x,this.y,this.z);}
  normalize(){const l=this.length()||1;return this.multiplyScalar(1/l);}
  lerp(v,t){this.x+=(v.x-this.x)*t;this.y+=(v.y-this.y)*t;this.z+=(v.z-this.z)*t;return this;}
}
const noop=()=>{};
function obj3(){const o={position:new V3(),rotation:{x:0,y:0,z:0,order:"XYZ",set:function(a,b,c){this.x=a;this.y=b;this.z=c;}},
  scale:Object.assign(new V3(1,1,1),{}),matrix:{},updateMatrix:noop,visible:true,userData:{},
  children:[],frustumCulled:true,lookAt:noop,updateProjectionMatrix:noop,renderOrder:0,
  clone:function(){return obj3();}};o.children=[];o.add=function(c){o.children.push(c);};return o;}
function geomPlane(w,h,sx,sz){
  const arr=new Float32Array((sx+1)*(sz+1)*3);let i=0;
  for(let iy=0;iy<=sz;iy++)for(let ix=0;ix<=sx;ix++){
    arr[i]=-w/2+w*ix/sx; arr[i+1]=0; arr[i+2]=-(h/2-h*iy/sz); i+=3;}
  return {attributes:{position:{array:arr,needsUpdate:false}},computeVertexNormals:noop,
    rotateX:noop,translate:noop};
}
const THREE={
  Vector3:V3,
  Scene:function(){const o=obj3();o.add=noop;return o;},
  Color:function(h){this.h=(h||0)|0;
    this.multiplyScalar=function(k){const r=((this.h>>16&255)*k)|0,g=((this.h>>8&255)*k)|0,b=((this.h&255)*k)|0;
      this.h=(r<<16)|(g<<8)|b;return this;};
    this.getHex=function(){return this.h;};},
  Fog:function(){},DoubleSide:2,
  PerspectiveCamera:function(){return obj3();},
  WebGLRenderer:function(){return{setPixelRatio:noop,setSize:noop,render:noop,domElement:{style:{},addEventListener:noop}};},
  DirectionalLight:function(){return obj3();},HemisphereLight:function(){return obj3();},
  DataTexture:function(){return{needsUpdate:false};},NearestFilter:1,LuminanceFormat:1,BackSide:2,
  MeshToonMaterial:function(){return{};},MeshBasicMaterial:function(){return{};},
  ShaderMaterial:function(){return{};},PointsMaterial:function(){return{};},
  SphereGeometry:function(){return geomPlane(1,1,1,1);},
  ConeGeometry:function(){return geomPlane(1,1,1,1);},
  CylinderGeometry:function(){return geomPlane(1,1,1,1);},
  IcosahedronGeometry:function(){return geomPlane(1,1,1,1);},
  BoxGeometry:function(){return geomPlane(1,1,1,1);},
  PlaneBufferGeometry:function(w,h,sx,sz){return geomPlane(w,h,sx,sz);},
  BufferGeometry:function(){const g={attributes:{position:{needsUpdate:false}}};
    g.setAttribute=function(n,a){g.attributes[n]=a;};return g;},
  BufferAttribute:function(a,n){return{array:a,itemSize:n,count:a.length/n};},
  Mesh:function(g,mat){const o=obj3();o.geometry=g;o.material=mat;return o;},
  Points:function(g){const o=obj3();o.geometry=g;return o;},
  Group:function(){const o=obj3();o.children=[];o.add=c=>o.children.push(c);return o;},
  Object3D:function(){return obj3();},
  InstancedMesh:function(g,mat,n){const o=obj3();o.count=n;o.setMatrixAt=noop;
    o.instanceMatrix={needsUpdate:false};return o;}
};
const elStore={};
function el(){return{classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
  style:{},textContent:"",innerHTML:"",value:"",placeholder:"",onclick:null,
  addEventListener:noop,setPointerCapture:noop,appendChild:noop};}
const segButtons=[
  Object.assign(el(),{dataset:{st:"-1"}}),
  Object.assign(el(),{dataset:{st:"1"}})];
const document={getElementById:id=>elStore[id]||(elStore[id]=el()),
  body:{appendChild:noop},querySelectorAll:sel=>(sel===".seg-b"?segButtons:[]),
  createElement:el,addEventListener:noop};
const store={};
const localStorage={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},
  removeItem:k=>{delete store[k];}};
let rafQueue=[];
const sandbox={THREE,document,console,Math,performance:{now:()=>Date.now()},
  requestAnimationFrame:f=>{rafQueue.push(f);return 1;},addEventListener:noop,
  innerWidth:390,innerHeight:844,devicePixelRatio:2,navigator:{},window:{},localStorage,
  setTimeout:noop,Float32Array,Uint8Array,JSON,Date,btoa:noop,atob:noop,
  RTCPeerConnection:function(){return{createDataChannel:()=>({}),createOffer:async()=>({}),
    setLocalDescription:noop,iceGatheringState:"complete"};},
  TextEncoder:function(){},Response:function(){},CompressionStream:undefined};
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox);
const exportLine = "\n;globalThis.__G={get P(){return P},get IN(){return IN},heightAt,normalAt,"+
  "stepPlayer,syncChunks,featOf,dropOf,cumDrop,resetPlayer,chunks,GOAL,obstaclesNear,land,"+
  "wipeout,trickName,get SEED(){return SEED},setSeed(v){SEED=v},get state(){return state},"+
  "CS,SLOPE,roomCode,buildRider,rider,MAT,ranges:[rangeFar,rangeMid,rangeNear],stepBackdrop,"+
  "applyStance,REGULAR,GOOFY,setStance,loadStance,get STANCE(){return STANCE},JOY,axis,readTouch,"+
  "JOY_R,DEAD_C,DEAD_T,GRAB_PUSH,joyHome,TIME,poseRider,WAIST,ARM_REST,GRABS,"+
  "grabKindFrom,RUN_SECONDS,clockText,setMode,loadMode,get MODE(){return MODE},updateHUD};";
vm.runInContext(code+exportLine,sandbox,{filename:"game.js"});
module.exports=sandbox;
