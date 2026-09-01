const S=require("./harness.js"); const G=S.__G;
let pass=0,fail=0;
const ok=(c,m,extra)=>{ if(c){pass++;} else {fail++;console.log("  FAIL: "+m+(extra?"  ["+extra+"]":""));} };

const SEEDS=[1337,42,90210,7,555001,314159,86,2024];

/* 1 — terrain continuity: no seams anywhere, including across band boundaries */
{
  let worst=0,where="";
  for(const sd of SEEDS){
    G.setSeed(sd); G.cumDrop(400);
    for(let z=0;z<26000;z+=3.7){
      for(const x of [-70,-12,0,25,88]){
        const a=G.heightAt(x,z), b=G.heightAt(x,z+0.05);
        const d=Math.abs(b-a);
        if(d>worst){worst=d;where=`seed ${sd} x${x} z${z.toFixed(0)}`;}
      }
    }
  }
  ok(worst<0.9,"terrain is continuous over 5cm steps (max step "+worst.toFixed(3)+"m)",where);
}

/* 2 — mountain always descends over any 200m window */
{
  let bad=0;
  for(const sd of SEEDS){ G.setSeed(sd); G.cumDrop(400);
    for(let z=0;z<20000;z+=200){ if(G.heightAt(0,z+200)>=G.heightAt(0,z)) bad++; } }
  ok(bad===0,"fall line never reverses over 200m ("+bad+" flat/uphill windows)");
}

/* 3 — cliff bands produce real drops */
{
  G.setSeed(1337); let cliffs=0,drops=[];
  for(let b=1;b<160;b++) if(G.featOf(b)==="cliff"){ cliffs++;
    const zc=b*G.CS+58;
    drops.push(G.heightAt(0,zc-3)-G.heightAt(0,zc+8)); }
  ok(cliffs>25,"cliff bands are frequent ("+cliffs+"/159 bands)");
  const small=drops.filter(d=>d<8).length;
  ok(small===0,"every cliff is a real drop ≥8m ("+small+" too small, median "+
    drops.sort((a,b)=>a-b)[drops.length>>1].toFixed(1)+"m)");
}

/* 4 — bowl walls contain the rider */
{
  G.setSeed(1337);
  ok(G.heightAt(105,4000)>G.heightAt(0,4000),"bowl walls rise at the edges");
}

/* 5 — physics: straight run reaches a sane terminal speed and never NaNs */
{
  G.setSeed(1337); G.resetPlayer();
  const P=G.P, IN=G.IN; let nan=false,maxS=0,airFrames=0;
  for(let i=0;i<60*90;i++){
    IN.carve=0;IN.spin=0;IN.flip=0;IN.hold=false;IN.grabL=false;IN.jump=false;
    G.syncChunks(P.pos.z); G.stepPlayer(1/60);
    if(!isFinite(P.speed)||!isFinite(P.pos.y)||!isFinite(P.pos.x)) {nan=true;break;}
    maxS=Math.max(maxS,P.speed); if(P.air) airFrames++;
  }
  ok(!nan,"90s straight run produces no NaN");
  ok(maxS>18&&maxS<52,"terminal speed is plausible ("+(maxS*3.6).toFixed(0)+" km/h)");
  ok(airFrames>60,"terrain launches the rider unprompted ("+(airFrames/60).toFixed(1)+"s airborne)");
  ok(P.pos.z>1500,"rider actually travels downhill ("+P.pos.z.toFixed(0)+"m)");
}

/* 6 — scoring: clean 360 with air pays, and pays more with combo */
{
  G.setSeed(1337); G.resetPlayer();
  const P=G.P;
  P.airT=1.6; P.spinAcc=360; P.flipAcc=0; P.grabT=0; G.land(true);
  const first=P.score;
  ok(first>110&&first<600,"a 360 with 1.6s air scores sensibly ("+first+")");
  P.airT=1.6; P.spinAcc=360; P.flipAcc=0; P.grabT=0; G.land(true);
  const second=P.score-first;
  ok(second>first,"combo multiplies the second trick ("+first+" then "+second+")");
}

/* 7 — a sloppy landing is a wipeout, not free points */
{
  G.setSeed(1337); G.resetPlayer();
  const P=G.P; P.airT=2.0; P.spinAcc=90; P.flipAcc=0; G.land(false);
  ok(P.score===0,"failed landing scores nothing");
  ok(P.combo===0,"failed landing kills the combo");
}

/* 8 — pace: a competent rider reaches 10,000 in a reasonable run length */
{
  G.setSeed(1337); G.resetPlayer();
  const P=G.P,IN=G.IN; let t=0,jumps=0;
  for(let i=0;i<60*600&&P.score<G.GOAL;i++){
    IN.carve=0;IN.spin=0;IN.flip=0;IN.hold=false;IN.grabL=false;IN.jump=false;
    if(!P.air&&P.crash<=0&&i%110===0){IN.jump=true;jumps++;}
    if(P.air&&P.airT>0.15){
      const gap=P.pos.y-G.heightAt(P.pos.x,P.pos.z);
      IN.spin = gap>6 ? 1 : 0;                 // a competent rider stops spinning to land
      IN.grab = gap>6;
    }
    G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60); t+=1/60;
  }
  ok(P.score>=G.GOAL,"a spinning rider can reach 10,000 (got "+P.score+")");
  ok(t>110&&t<600,"run length lands between 2 and 10 wall-clock minutes ("+(t/60).toFixed(1)+" min, "+jumps+" jumps)");
}

/* 9 — obstacles exist, are placed on the surface, and stay off the cliff lip */
{
  G.setSeed(1337); G.syncChunks(0);
  let total=0,onLip=0,offMap=0;
  for(let b=1;b<40;b++){
    G.syncChunks(b*G.CS+50);
    for(const c of G.chunks){
      if(c.band!==b) continue;
      total+=c.obs.length;
      for(const o of c.obs){
        if(Math.abs(o.x)>100) offMap++;
        if(G.featOf(b)==="cliff"&&o.t===0&&Math.abs(o.z-(b*G.CS+58))<16) onLip++;
      }
    }
  }
  ok(total>400,"chunks are populated with pines and rocks ("+total+" over 39 bands)");
  ok(onLip===0,"no pines parked on a cliff lip ("+onLip+")");
  ok(offMap===0,"nothing spawns outside the bowl ("+offMap+")");
}

/* 10 — determinism: same seed, identical mountain (this is what multiplayer relies on) */
{
  G.setSeed(4242); G.cumDrop(200);
  const a=[]; for(let z=0;z<9000;z+=57) a.push(G.heightAt(z%80-40,z));
  G.setSeed(999); G.cumDrop(200); G.heightAt(0,5000);
  G.setSeed(4242); G.cumDrop(200);
  const b=[]; for(let z=0;z<9000;z+=57) b.push(G.heightAt(z%80-40,z));
  ok(a.every((v,i)=>v===b[i]),"same seed regenerates a bit-identical mountain");
}

/* 10b — REGRESSION: the rider must never be far from the snow that is actually drawn.
   The rendered surface is bilinear between chunk vertices; physics uses heightAt().
   A slot left unbuilt renders as a flat plane at y=0 and puts the rider tens of metres
   under (or over) visible snow — which is exactly what this catches. */
{
  const CW=220,SEGX=48,SEGZ=88;
  function meshH(ch,x,z){
    const arr=ch.mesh.geometry.attributes.position.array, z0=ch.band*G.CS;
    const fx=(x+CW/2)/CW*SEGX, fz=(z-z0)/G.CS*SEGZ;
    const ix=Math.floor(fx),iz=Math.floor(fz);
    if(ix<0||iz<0||ix>=SEGX||iz>=SEGZ) return null;
    const tx=fx-ix,tz=fz-iz,at=(a,b)=>arr[((b*(SEGX+1))+a)*3+1];
    return (at(ix,iz)*(1-tx)+at(ix+1,iz)*tx)*(1-tz)+(at(ix,iz+1)*(1-tx)+at(ix+1,iz+1)*tx)*tz;
  }
  let worst=0,unbuilt=0,overlap=0,where="";
  for(const sd of [1337,42,90210]){
    G.setSeed(sd); G.resetPlayer();
    const P=G.P,IN=G.IN;
    for(let i=0;i<60*180;i++){
      IN.carve=Math.sin(i/95)*0.7;IN.spin=0;IN.flip=0;IN.hold=false;IN.grabL=false;IN.jump=false;
      if(!P.air&&P.crash<=0&&i%110===0)IN.jump=true;
      G.stepPlayer(1/60); G.syncChunks(P.pos.z);
      if(G.chunks.some(c=>c.band<0)) unbuilt++;
      let covering=0;
      for(const c of G.chunks){
        if(c.band<0) continue;
        const h=meshH(c,P.pos.x,P.pos.z);
        if(h===null) continue;
        covering++;
        if(!P.air&&!P.grinding){ const gap=Math.abs(P.pos.y-h);
          if(gap>worst){worst=gap;where="seed "+sd+" z="+P.pos.z.toFixed(0);} }
      }
      if(covering>1) overlap++;
    }
  }
  ok(unbuilt===0,"no unbuilt chunk ever sits in the pool ("+unbuilt+" frames)");
  ok(overlap===0,"exactly one snow surface under the rider at all times ("+overlap+" overlapping frames)");
  ok(worst<0.6,"grounded rider never separates from the drawn snow (worst "+
     worst.toFixed(2)+"m / "+(worst*3.28).toFixed(1)+"ft)",where);
}

/* 11 — chunk pool recycles without leaking */
{
  G.setSeed(1337);
  for(let z=0;z<40000;z+=100) G.syncChunks(z);
  ok(G.chunks.length===6,"chunk pool stays fixed at 6 ("+G.chunks.length+")");
  G.setSeed(1337); G.resetPlayer();
  const boot=G.chunks.map(c=>c.band).sort((x,y)=>x-y);
  ok(boot[0]===0&&boot[5]===5,"all six slots are filled on the first frame ["+boot.join(",")+"]");
  ok(new Set(boot).size===6,"no two slots hold the same band at boot");
  const bands=G.chunks.map(c=>c.band).sort((x,y)=>x-y);
  ok(bands[5]-bands[0]===5,"pool covers a contiguous 6-band window ["+bands.join(",")+"]");
}

/* 12 — trick naming */
{
  ok(G.trickName(3,0,true,true).includes("540"),"540 named correctly");
  ok(G.trickName(0,1,false,false).includes("FLIP"),"flip named correctly");
}

/* 14 — distant ranges: finite geometry, three depths, genuinely jagged ridgelines */
{
  ok(G.ranges.length===3,"three depth layers of distant peaks");
  let nan=0, tops=[];
  for(const r of G.ranges){
    const a=r.geometry.attributes.position.array;
    for(let i=0;i<a.length;i++) if(!isFinite(a[i])) nan++;
    const ys=[]; for(let i=1;i<a.length;i+=3) if(a[i]>-400) ys.push(a[i]);
    tops.push({min:Math.min(...ys),max:Math.max(...ys)});
  }
  ok(nan===0,"range geometry has no NaN vertices ("+nan+")");
  const spread=tops.map(t=>t.max-t.min);
  ok(spread.every(s=>s>60),"ridgelines vary by at least 60m of relief ("+spread.map(s=>s.toFixed(0)).join("/")+")");
  ok(tops.every(t=>t.max>0),"peaks rise above eye level ("+tops.map(t=>t.max.toFixed(0)).join("/")+")");
}

/* 15 — rider assembly */
{
  const r=G.buildRider(0x7fe3ff,0xff6b4a);
  let parts=0,outlines=0;
  (function walk(n){ (n.children||[]).forEach(c=>{ parts++; if(c.material===G.MAT.ink) outlines++; walk(c); }); })(r);
  ok(parts>=24,"rider is built from "+parts+" parts (board, baggy pants, puffy jacket, helmet, goggles)");
  ok(outlines>0&&outlines<=10,"ink silhouettes on "+outlines+" major shapes only (draw-call budget)");
  ok(parts<=48,"a rider costs "+parts+" draw calls — four riders stay under ~200");
  ok(!!(r.userData.armL&&r.userData.armR&&r.userData.head),"arms and head are wired for animation");
}

/* 16 — stance: the body sits across the deck, and goofy mirrors regular */
{
  const reg=G.buildRider(0x7fe3ff,0xff6b4a,G.REGULAR);
  const goof=G.buildRider(0x7fe3ff,0xff6b4a,G.GOOFY);
  const ry=reg.userData.stance.rotation.y, gy=goof.userData.stance.rotation.y;
  ok(Math.abs(ry)>1.0,"body faces across the board, not down it ("+(ry*57.3).toFixed(0)+"°)");
  ok(Math.abs(Math.abs(ry)-Math.abs(gy))<1e-9&&Math.sign(ry)!==Math.sign(gy),
     "goofy is an exact mirror of regular ("+(ry*57.3).toFixed(0)+"° vs "+(gy*57.3).toFixed(0)+"°)");
  ok(Math.sign(reg.userData.footF.rotation.y)===Math.sign(ry)&&
     Math.abs(reg.userData.footF.rotation.y)<Math.abs(ry)+0.01,
     "front binding is angled toward the nose, same side as the body");
  const fF=Math.abs(reg.userData.footF.rotation.y), fB=Math.abs(reg.userData.footB.rotation.y);
  ok(fF<fB,"front foot is angled further toward the nose than the back ("+
     ((Math.PI/2-fF)*57.3).toFixed(0)+"° vs "+((Math.PI/2-fB)*57.3).toFixed(0)+"°)");
  ok(Math.sign(reg.userData.headG.rotation.y)!==Math.sign(ry),
     "head counter-rotates so the rider watches his line");
  ok(reg.userData.footF.position.z>0&&reg.userData.footB.position.z<0,
     "feet sit over their bindings, nose and tail");
}

/* 17 — stance choice survives a reload */
{
  G.setStance(G.GOOFY);
  ok(G.STANCE===G.GOOFY,"stance switches to goofy");
  ok(G.rider.userData.stance.rotation.y>0,"the live rider flips immediately");
  G.loadStance();
  ok(G.STANCE===G.GOOFY,"stance is remembered across a reload");
  G.setStance(G.REGULAR);
}

/* 18 — joystick axes: deadzone, saturation, and no drift at rest */
{
  ok(G.axis(0,G.DEAD_C)===0,"a dead-centre thumb produces no steering");
  ok(G.axis(G.DEAD_C-1,G.DEAD_C)===0,"jitter inside the deadzone is ignored");
  ok(G.axis(G.JOY_R,G.DEAD_C)===1,"a full push saturates at 1.0");
  ok(G.axis(-G.JOY_R*3,G.DEAD_C)===-1,"pushing past the ring stays clamped at -1.0");
  const mid=G.axis(G.DEAD_C+(G.JOY_R-G.DEAD_C)/2,G.DEAD_C);
  ok(Math.abs(mid-0.5)<1e-9,"the deadzone is subtracted, not clipped (half push = "+mid.toFixed(2)+")");
}

/* 18b — steering direction: pushing the stick right must turn toward screen-right.
   The chase camera looks down +Z, so screen-right is world -X. */
{
  G.setSeed(1337); G.resetPlayer();
  const P=G.P,IN=G.IN;
  const y0=P.yaw;
  for(let i=0;i<40;i++){ IN.carve=1;IN.spin=0;IN.flip=0;IN.hold=false;IN.grabL=false;IN.jump=false;
    G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60); }
  ok(P.yaw<y0,"stick right decreases yaw");
  ok(P.pos.x<-0.5,"stick right actually moves the rider to screen-right (x="+P.pos.x.toFixed(1)+")");
  ok(P.roll>0,"the rider leans into the turn rather than away from it");
  G.setSeed(1337); G.resetPlayer();
  const x1=(()=>{ for(let i=0;i<40;i++){ IN.carve=-1;IN.spin=0;IN.flip=0;IN.hold=false;IN.grabL=false;IN.jump=false;
    G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60);} return P.pos.x; })();
  ok(x1>0.5,"stick left moves the rider to screen-left (x="+x1.toFixed(1)+")");
}

/* 18c — spin follows the same convention as steering */
{
  G.setSeed(1337); G.resetPlayer();
  const P=G.P,IN=G.IN;
  P.air=true; P.vy=9; P.airT=0; P.spinAcc=0;
  IN.carve=0;IN.flip=0;IN.hold=false;IN.grabL=false;IN.jump=false; IN.spin=1;
  for(let i=0;i<20;i++){ G.stepPlayer(G.TIME/60); if(!P.air) break; }
  ok(P.spinAcc<0,"pushing the trick stick right spins the rider right");
}

/* 18d — slow motion and jump height */
{
  ok(G.TIME>0.85&&G.TIME<1.0,"global time runs at "+(G.TIME*100).toFixed(0)+"% speed");
  G.setSeed(1337); G.resetPlayer();
  const P=G.P,IN=G.IN;
  for(let i=0;i<180;i++){ IN.carve=0;IN.spin=0;IN.flip=0;IN.hold=false;IN.grabL=false;IN.jump=false;
    G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60); }        // build speed on the flat
  const ground=G.heightAt(P.pos.x,P.pos.z);
  IN.jump=true; G.stepPlayer(G.TIME/60);
  let peak=0,steps=0;
  while(P.air&&steps<400){ IN.jump=false;IN.carve=0;IN.spin=0;IN.flip=0;IN.hold=false;IN.grabL=false;
    peak=Math.max(peak,P.pos.y-G.heightAt(P.pos.x,P.pos.z));
    G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60); steps++; }
  const hang=steps/60;
  ok(peak>2.0,"a flat-ground ollie clears "+peak.toFixed(1)+"m");
  ok(hang>1.0&&hang<5.0,"hang time is "+hang.toFixed(1)+"s of wall clock");
}

/* 18e — REGRESSION: arms must hang clear of the jacket, not inside it.
   The jacket is a 0.42m-radius cylinder; a hand at x≈0 is invisible. */
{
  const r=G.buildRider(0x7fe3ff,0xff6b4a,G.REGULAR), u=r.userData;
  const hand=a=>a.position.x+0.82*Math.sin(a.rotation.z);
  ok(Math.abs(hand(u.armR))>0.50,"right hand hangs clear of the jacket (x="+hand(u.armR).toFixed(2)+")");
  ok(Math.abs(hand(u.armL))>0.50,"left hand hangs clear of the jacket (x="+hand(u.armL).toFixed(2)+")");
  ok(Math.sign(hand(u.armR))===1&&Math.sign(hand(u.armL))===-1,
     "each arm swings outward on its own side, not across the body");
}

/* 18f — the grab is a visible pose change, and the hand actually reaches the deck */
{
  const r=G.buildRider(0x7fe3ff,0xff6b4a,G.REGULAR), u=r.userData, W=G.WAIST;
  const handY=()=>{
    const bend=u.upper.rotation.x, hip=u.stance.position.y;
    const shy=W+hip+0.80*Math.cos(bend);
    const az=u.armR.rotation.z, ax=u.armR.rotation.x, vy=-0.82*Math.cos(az);
    const y2=vy*Math.cos(ax), z2=vy*Math.sin(ax);
    return shy + (y2*Math.cos(bend)-z2*Math.sin(bend));
  };
  const deckY=()=>u.lower.position.y+0.05;
  const settle=(grab,gap)=>{ for(let i=0;i<120;i++) G.poseRider(r,1/60,{grab:grab,air:true,gap:gap}); };

  settle(false,20);
  const rest={bend:u.upper.rotation.x,hip:u.stance.position.y,leg:u.legF.scale.y,
              arm:u.armR.rotation.z,hand:handY(),reach:handY()-deckY()};
  settle(true,20);
  const grab={bend:u.upper.rotation.x,hip:u.stance.position.y,leg:u.legF.scale.y,
              arm:u.armR.rotation.z,hand:handY(),reach:handY()-deckY(),lift:u.lower.position.y};

  ok(grab.bend-rest.bend>0.5,"rider folds at the waist ("+(rest.bend*57.3).toFixed(0)+"° to "+
     (grab.bend*57.3).toFixed(0)+"°)");
  ok(rest.hip-grab.hip>0.25,"hips drop into a crouch ("+(rest.hip-grab.hip).toFixed(2)+"m)");
  ok(rest.leg-grab.leg>0.3,"legs compress rather than staying rigid ("+
     (rest.leg*100).toFixed(0)+"% to "+(grab.leg*100).toFixed(0)+"%)");
  ok(Math.abs(grab.arm)<Math.abs(rest.arm)-0.2,"arms swing down toward the deck");
  ok(u.armR.rotation.x<-0.5,"arms reach out over the board, not down the rider's back");
  ok(grab.lift>0.2,"the board tucks up to meet the hands ("+grab.lift.toFixed(2)+"m)");
  ok(grab.reach<0.30,"hand closes to within "+(grab.reach*100).toFixed(0)+
     "cm of the deck (was "+(rest.reach*100).toFixed(0)+"cm at rest)");

  settle(false,20);
  ok(Math.abs(u.upper.rotation.x-rest.bend)<0.02,"the pose returns to neutral on release");
  ok(Math.abs(u.lower.position.y)<0.01,"the board returns to the rider's true position");
}

/* 18h — REGRESSION: a grab held all the way to touchdown must not leave the board
   floating above the physics contact point. */
{
  const r=G.buildRider(0x7fe3ff,0xff6b4a,G.REGULAR), u=r.userData;
  for(let i=0;i<120;i++) G.poseRider(r,1/60,{grab:true,air:true,gap:20});   // deep in the air, fully tucked
  ok(u.lower.position.y>0.25,"board is tucked at altitude");
  for(let i=0;i<120;i++) G.poseRider(r,1/60,{grab:true,air:true,gap:0.6});  // grab still held, ground arriving
  ok(u.lower.position.y<0.02,"board has returned to the feet before touchdown ("+
     u.lower.position.y.toFixed(3)+"m)");
  ok(u.stance.position.y>-0.05,"rider has stood back up to absorb the landing");
}

/* 18g — grabs must be combinable with spins and flips.
   The old rule required the trick stick to be parked, so a grab and a flip were
   mutually exclusive by construction. The grab hand is now the LEFT stick. */
{
  const IN=G.IN;
  G.JOY.R.touch={id:1,x0:0,y0:0,t0:performance.now()-800,moved:70};
  G.JOY.R.dx=0; G.JOY.R.dy=-45;                       // trick stick pushed up: front flip
  G.JOY.L.touch={id:2,x0:0,y0:0,t0:performance.now()-800,moved:40};
  G.JOY.L.dx=0; G.JOY.L.dy=40;                        // grab stick pushed down: indy
  IN.hold=false; IN.grabL=false; G.readTouch();
  ok(IN.flip>0.5,"trick stick still drives the flip while grabbing ("+IN.flip.toFixed(2)+")");
  ok(IN.grabL===true,"left stick registers a grab at the same time");
  ok(G.grabKindFrom(IN.grabDir)===0,"pushing down selects the indy");
  ok(G.grabKindFrom(Math.PI/2)===1&&G.grabKindFrom(Math.PI)===2&&G.grabKindFrom(0)===3,
     "up / left / right select method, mute and stalefish");
  G.JOY.L.dx=0; G.JOY.L.dy=6; IN.grabL=false; G.readTouch();
  ok(IN.grabL===false,"a barely-nudged left stick steers instead of grabbing");
  G.JOY.L.touch=null; G.JOY.R.touch=null;
}

/* 18i — the speed tuck */
{
  G.setSeed(1337); G.resetPlayer();
  const P=G.P,IN=G.IN;
  // measure sustained speed while genuinely riding snow: rails accelerate you and
  // airtime freezes speed, so both are excluded or the comparison is meaningless
  const run=hold=>{
    G.setSeed(4242); G.resetPlayer();
    const sp=[]; let tuckFrames=0;
    for(let i=0;i<60*90;i++){
      IN.carve=0;IN.spin=0;IN.flip=0;IN.grabL=false;IN.jump=false;IN.hold=hold;
      G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60);
      if(!P.air&&!P.grinding&&P.crash<=0){ sp.push(P.speed); if(P.tucking) tuckFrames++; }
    }
    sp.sort((a,b)=>a-b);
    return {fast:sp[Math.floor(sp.length*0.9)],tuckFrames,dist:P.pos.z};
  };
  const open=run(false), tucked=run(true);
  ok(open.tuckFrames===0,"no tuck unless the stick is held");
  ok(tucked.tuckFrames>1000,"tuck engages and stays engaged while held ("+tucked.tuckFrames+" frames)");
  ok(tucked.fast>open.fast*1.10,"tucking is meaningfully faster when running ("+
     (open.fast*3.6).toFixed(0)+" -> "+(tucked.fast*3.6).toFixed(0)+" km/h at the 90th percentile)");
  ok(tucked.dist>open.dist*1.03,"and covers more mountain ("+
     (open.dist/1000).toFixed(2)+" -> "+(tucked.dist/1000).toFixed(2)+" km in 90s)");
  // steering authority must be the cost
  G.setSeed(1337); G.resetPlayer();
  for(let i=0;i<120;i++){ IN.carve=1;IN.spin=0;IN.flip=0;IN.grabL=false;IN.jump=false;IN.hold=false;
    G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60); }
  const openTurn=Math.abs(P.yaw);
  G.setSeed(1337); G.resetPlayer();
  for(let i=0;i<120;i++){ IN.carve=1;IN.spin=0;IN.flip=0;IN.grabL=false;IN.jump=false;IN.hold=true;
    G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60); }
  ok(Math.abs(P.yaw)<openTurn*0.75,"a tucked rider gives up steering ("+
     (openTurn*57.3).toFixed(0)+"° vs "+(Math.abs(P.yaw)*57.3).toFixed(0)+"°)");
}

/* 18j — grab types carry different value, and the pose differs per grab */
{
  ok(G.GRABS.length===4,"four named grabs");
  ok(G.GRABS[0].mult===1&&G.GRABS[1].mult>1.2,"the method is worth more than the indy");
  const r=G.buildRider(0x7fe3ff,0xff6b4a,G.REGULAR),u=r.userData;
  for(let i=0;i<120;i++) G.poseRider(r,1/60,{grab:true,kind:0,air:true,gap:20});
  const indy={aR:u.armR.rotation.x,aL:u.armL.rotation.x,twist:u.upper.rotation.z};
  for(let i=0;i<120;i++) G.poseRider(r,1/60,{grab:true,kind:1,air:true,gap:20});
  const method={aR:u.armR.rotation.x,aL:u.armL.rotation.x,twist:u.upper.rotation.z};
  ok(Math.abs(indy.aR-indy.aL)<0.01,"an indy reaches with both hands");
  ok(method.aL<method.aR-0.4,"a method reaches with one hand and leaves the other high");
  ok(Math.abs(method.twist)>0.2,"a method twists the body, an indy does not ("+
     indy.twist.toFixed(2)+" vs "+method.twist.toFixed(2)+")");
}

/* 18k — time attack */
{
  ok(G.RUN_SECONDS===120,"time attack runs for two minutes");
  ok(G.clockText(120)==="2:00"&&G.clockText(9)==="0:09"&&G.clockText(-3)==="0:00",
     "the clock formats and floors at zero");
  G.setMode("time"); ok(G.MODE==="time","mode switches to time attack");
  G.loadMode(); ok(G.MODE==="time","mode is remembered across a reload");
  G.setMode("endless"); ok(G.MODE==="endless","mode switches back");
}

/* 18l — LAYOUT: joystick furniture must not collide with anything, at any viewport.
   The captions used to sit below the rings and overlapped the hint line in landscape. */
{
  const CAP=19, RING=G.JOY_R;
  const sizes=[[390,844,"portrait phone"],[844,390,"landscape phone"],
               [320,568,"small portrait"],[430,932,"large portrait"],
               [932,430,"large landscape"],[280,653,"narrow cover screen"]];
  let worstBottom=1e9, worstGap=1e9, offscreen=0, capOff=0, bad="";
  for(const [w,h,label] of sizes){
    S.innerWidth=w; S.innerHeight=h; G.joyHome();
    const L=G.JOY.L.home, R=G.JOY.R.home;
    const bottom=h-(L[1]+RING);
    const gap=R[0]-L[0]-2*RING;
    if(bottom<worstBottom){worstBottom=bottom;bad=label;}
    worstGap=Math.min(worstGap,gap);
    if(L[0]-RING<0||R[0]+RING>w) offscreen++;
    if(L[1]-RING-CAP<0) capOff++;
    if(Math.abs((w-R[0])-L[0])>0.51) offscreen++;   // must stay symmetric
  }
  ok(worstBottom>=24,"rings clear the bottom edge on every viewport (worst "+
     worstBottom.toFixed(0)+"px, "+bad+")");
  ok(worstGap>0,"the two rings never overlap each other (closest "+worstGap.toFixed(0)+"px apart)");
  ok(offscreen===0,"rings stay on screen and symmetric at every size");
  ok(capOff===0,"the caption above each ring is never clipped off the top");
  S.innerWidth=390; S.innerHeight=844; G.joyHome();
}

/* 20 — stunt park: kicker ramps are built into the terrain itself */
{
  G.setSeed(1337); G.cumDrop(200);
  let parks=0;
  for(let b=1;b<160;b++) if(G.featOf(b)==="park") parks++;
  ok(parks>10,"park bands appear regularly ("+parks+"/159)");

  let worstStep=0, tallest=0;
  for(let b=1;b<160;b++){
    if(G.featOf(b)!=="park") continue;
    const ks=G.parkKickers(b);
    ok(ks.length===3,"each park has three kickers");
    for(const k of ks){
      tallest=Math.max(tallest,G.kickerAt(b,k.xc,k.kz));
      // the lip must be continuous or the physics launches off a cliff edge
      for(let u=-14;u<6;u+=0.05){
        const a=G.kickerAt(b,k.xc,k.kz+u), c=G.kickerAt(b,k.xc,k.kz+u+0.05);
        worstStep=Math.max(worstStep,Math.abs(c-a));
      }
      ok(Math.abs(k.xc)<50,"kickers stay inside the bowl");
    }
  }
  ok(worstStep<0.6,"kicker ramps are continuous (worst 5cm step "+worstStep.toFixed(3)+"m)");
  ok(tallest>3,"kickers stand at least 3m proud of the slope ("+tallest.toFixed(1)+"m)");

  // the ramp must return to zero, or the whole band would sit permanently raised
  for(let b=1;b<160;b++){
    if(G.featOf(b)!=="park") continue;
    ok(G.kickerAt(b,0,0)===0&&G.kickerAt(b,0,99.9)===0,"kickers fade out at the band seams");
    break;
  }
}

/* 21 — fallen trees exist, sit on the snow, and keep other scenery clear */
{
  G.setSeed(1337); G.resetPlayer();
  let logs=[], bands=0, badSeat=0, badSlope=0, treeClash=0;
  for(let b=1;b<40;b++){
    G.syncChunks(b*G.CS+50);
    for(const c of G.chunks){
      if(c.band!==b) continue;
      bands++;
      const mine=c.obs.filter(o=>o.t===2);
      logs=logs.concat(mine);
      for(const L of mine){
        // the trunk line must rest ON the snow along its whole length:
        // never buried, never levitating
        const sn0=Math.sin(L.yaw), cs0=Math.cos(L.yaw);
        let minClear=9, maxClear=-9;
        for(let a=-L.half;a<=L.half;a+=L.half/10){
          const ground=G.heightAt(L.x+sn0*a,L.z+cs0*a);
          const trunk=L.cy+a*L.dy;
          minClear=Math.min(minClear,trunk-ground);
          maxClear=Math.max(maxClear,trunk-ground);
        }
        if(minClear<2*G.LOG_R-0.05) badSeat++;
        if(maxClear>2*G.LOG_R+1.35) badSeat++;
        // the trunk is straight, so its pitch must track the ground closely enough
        // that no part of it hangs in mid-air
        if(maxClear-minClear>1.35) badSlope++;
        for(const o of c.obs){
          if(o.t===2) continue;
          const along=(o.x-L.x)*sn0+(o.z-L.z)*cs0, lat=(o.x-L.x)*cs0-(o.z-L.z)*sn0;
          if(Math.abs(along)<L.half&&Math.abs(lat)<1.6) treeClash++;
        }
      }
    }
  }
  ok(logs.length>60,"fallen trees are common ("+logs.length+" over "+bands+" bands)");
  ok(badSeat===0,"every trunk sits on the snow rather than floating ("+badSeat+" wrong)");
  ok(badSlope===0,"each trunk's stored pitch matches the ground it lies on ("+badSlope+" wrong)");
  ok(treeClash===0,"nothing else is planted on a rail line ("+treeClash+" clashes)");
  const med=logs.map(l=>l.half*2).sort((a,b)=>a-b)[logs.length>>1];
  ok(med>18,"trunks are long enough to be worth riding (median "+med.toFixed(0)+"m)");
}

/* 22 — grinding: entry, scoring, and the pop-off */
{
  G.setSeed(1337); G.resetPlayer(); G.syncChunks(600);
  let log=null;
  for(const c of G.chunks) for(const o of (c.obs||[])) if(o.t===2&&!log&&o.z>500) log=o;
  const P=G.P, IN=G.IN;
  const lineUp=()=>{
    P.pos.x=log.x-Math.sin(log.yaw)*(log.half+3);
    P.pos.z=log.z-Math.cos(log.yaw)*(log.half+3);
    P.pos.y=G.heightAt(P.pos.x,P.pos.z);
    P.yaw=log.yaw; P.speed=22; P.air=false; P.grinding=false; P.grindT=0; P.railCool=0;
    P.score=0; P.combo=0;
  };
  const idle=()=>{ IN.carve=0;IN.spin=0;IN.flip=0;IN.hold=false;IN.grabL=false;IN.jump=false; };

  lineUp();
  let best=0, onRail=0, height=0, comboPeak=0, lowest=9;
  for(let i=0;i<300;i++){ idle(); G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60);
    comboPeak=Math.max(comboPeak,P.combo);
    if(P.grinding){ onRail++; best=Math.max(best,P.grindT);
      const h=P.pos.y-G.heightAt(P.pos.x,P.pos.z);
      height=h; lowest=Math.min(lowest,h); } }
  ok(onRail>20,"riding onto an aligned trunk starts a grind ("+onRail+" frames)");
  ok(best>0.6,"the grind lasts "+best.toFixed(2)+"s");
  ok(lowest>0.5,"the rider sits on top of the trunk for its whole length (lowest "+lowest.toFixed(2)+"m)");
  ok(P.score>0,"a completed grind scores ("+P.score+")");
  ok(comboPeak>0,"a grind extends the combo chain");

  // crossing at a bad angle must not capture you
  lineUp(); P.yaw=log.yaw+1.4;
  let captured=0;
  for(let i=0;i<120;i++){ idle(); G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60);
    if(P.grinding) captured++; }
  ok(captured===0,"crossing a trunk sideways does not snap you onto it");

  // ollie off the rail, and no instant re-grind
  lineUp();
  for(let i=0;i<18;i++){ idle(); G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60); }
  if(P.grinding){
    idle(); IN.jump=true; G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60);
    ok(P.air===true,"tapping jump pops you off the rail into the air");
    ok(P.grinding===false,"the grind ends when you pop");
    ok(P.railCool>0,"a cooldown stops you snapping straight back on");
  } else { ok(false,"expected to be grinding before the pop test"); ok(false,""); ok(false,""); }
}

/* 23 — logs are ridden, never crashed into */
{
  G.setSeed(1337); G.resetPlayer(); G.syncChunks(600);
  let log=null;
  for(const c of G.chunks) for(const o of (c.obs||[])) if(o.t===2&&!log&&o.z>500) log=o;
  const P=G.P, IN=G.IN;
  P.pos.x=log.x; P.pos.z=log.z-log.half-2; P.pos.y=G.heightAt(P.pos.x,P.pos.z);
  P.yaw=log.yaw+1.5; P.speed=26; P.air=false; P.crash=0;
  let crashed=0;
  for(let i=0;i<90;i++){ IN.carve=0;IN.spin=0;IN.flip=0;IN.hold=false;IN.grabL=false;IN.jump=false;
    const c0=P.crash; G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60);
    if(P.crash>c0&&Math.hypot(P.pos.x-log.x,P.pos.z-log.z)<log.half) crashed++; }
  ok(crashed===0,"a trunk never causes a wipeout");
}

/* 24 — the snow trail must not sit between the camera and the rider */
{
  const arr=G.spray.geometry.attributes.position.array;
  const p={x:0,y:100,z:0}, dir={x:0,y:0,z:1};      // travelling toward +Z, camera behind at -Z
  G.emitSpray(p,dir,12);
  let ahead=0, above=0, n=0;
  for(let i=0;i<arr.length;i+=3){
    if(arr[i+1]<-9000||Math.abs(arr[i+1]-100)>3) continue;
    n++;
    if(arr[i+2]>p.z-0.4) ahead++;                  // spawned level with or in front of the board
    if(arr[i+1]>p.y) above++;                      // spawned above board height
  }
  ok(n>=12,"spray particles are emitted ("+n+")");
  ok(ahead===0,"every particle spawns behind the tail, not around the rider ("+ahead+" bad)");
  ok(above===0,"and below board height rather than up into the camera ("+above+" bad)");
}

/* 25 — parks must be findable: signposted, and one early in every run */
{
  for(const sd of [1337,42,90210,7,555001,314159]){
    G.setSeed(sd); G.cumDrop(60);
    let first=-1;
    for(let b=1;b<60&&first<0;b++) if(G.featOf(b)==="park") first=b;
    ok(first>0&&first<=3,"seed "+sd+": a park appears within 300m (band "+first+")");
  }
  G.setSeed(1337); G.resetPlayer();
  ok(G.nextParkBand(0)===3,"the park finder points at the first park from the gate");
  ok(G.nextParkBand(320)===3,"while you are inside the park it still reads as the park");
  ok(G.nextParkBand(420)>3,"and moves on to the next one once you are past");

  // signage instances actually get written for park bands and cleared elsewhere
  G.syncChunks(350);
  const park=G.chunks.find(c=>c.band===3);
  ok(!!park&&G.featOf(3)==="park","band 3 is the park");
  ok(!!park.poles&&!!park.flags,"the park chunk carries gate and flag instances");
  ok(park.poles.count===G.MAXP&&park.flags.count===G.MAXB,"signage pools are fixed size");
}

/* 26 — highlight capture: only eventful moments, best three kept */
{
  G.setSeed(1337); G.resetPlayer(); G.recReset();
  const P=G.P, IN=G.IN;
  for(let i=0;i<60*200;i++){
    IN.carve=0;IN.spin=0;IN.flip=0;IN.jump=false;IN.grabL=false;IN.hold=false;
    if(!P.air&&!P.grinding&&P.crash<=0&&i%110===0) IN.jump=true;
    if(P.air&&P.airT>0.15){ const g=P.pos.y-G.heightAt(P.pos.x,P.pos.z);
      if(g>6){ IN.spin=1; IN.grabL=true; IN.grabDir=Math.PI/2; } }
    G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60); G.recStep(G.TIME/60);
  }
  G.recClose();
  const clips=G.REC.clips;
  ok(clips.length>0&&clips.length<=3,"the reel keeps at most three clips ("+clips.length+")");
  ok(clips.every(c=>c.points>0),"every kept clip actually scored");
  ok(clips.every((c,i)=>i===0||clips[i-1].points>=c.points),"clips are ordered best first");
  ok(clips.every(c=>c.frames.length>=20&&c.frames.length<=G.MAX_CLIP),
     "clip lengths are bounded ("+clips.map(c=>c.frames.length).join("/")+" frames)");
  ok(clips.every(c=>c.label&&c.label.length),"each clip is captioned with its trick");
  // the pre-roll means a clip starts BEFORE the takeoff, not at it
  ok(clips.some(c=>c.frames.slice(0,8).every(f=>!f.air&&!f.grind)),
     "clips open with ground before the takeoff, not mid-air");
  ok(G.REC.pre.length<=G.PRE_FRAMES,"the rolling pre-roll buffer stays bounded");
  const f=clips[0].frames[0];
  ok(["x","y","z","yaw","spin","flip","roll","grab","kind","tuck","air","grind"]
     .every(k=>k in f),"frames carry everything needed to replay the pose");
}

/* 27 — memory: capture must not grow without bound over a long run */
{
  G.setSeed(42); G.resetPlayer(); G.recReset();
  const P=G.P, IN=G.IN;
  for(let i=0;i<60*400;i++){
    IN.carve=0;IN.spin=0;IN.flip=0;IN.jump=false;IN.grabL=false;IN.hold=false;
    if(!P.air&&!P.grinding&&P.crash<=0&&i%90===0) IN.jump=true;
    G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60); G.recStep(G.TIME/60);
  }
  const total=G.REC.clips.reduce((n,c)=>n+c.frames.length,0)+G.REC.pre.length;
  ok(total<=3*G.MAX_CLIP+G.PRE_FRAMES,
     "a 6-minute run holds at most "+total+" recorded frames, not the whole run");
}

/* 28 — the park has to be VISIBLE, not merely present.
   A 20deg ramp on a 22deg slope in untextured white snow is invisible, so groomed
   features are vertex-tinted. */
{
  G.setSeed(1337); G.setParkStart(false); G.resetPlayer();
  G.syncChunks(350);
  const park=G.chunks.find(c=>c.band===3);
  const plain=G.chunks.find(c=>c.band===2);   // open snow, loaded alongside the park
  ok(!!park.mesh.geometry.attributes.color,"terrain carries a colour attribute");
  const pc=park.mesh.geometry.attributes.color.array;
  const oc=plain.mesh.geometry.attributes.color.array;
  const uniq=new Set();
  for(let i=0;i<pc.length;i+=3) uniq.add(pc[i].toFixed(3)+","+pc[i+1].toFixed(3));
  const plainUniq=new Set();
  for(let i=0;i<oc.length;i+=3) plainUniq.add(oc[i].toFixed(3)+","+oc[i+1].toFixed(3));
  ok(plainUniq.size===1,"open snow is a single flat tone");
  ok(uniq.size>=3,"a park band paints ramp and lip tones as well as snow ("+uniq.size+" tones)");
  let ramp=0, lip=0;
  for(let i=0;i<pc.length;i+=3){
    if(pc[i]>0.99&&pc[i+1]<0.85) lip++;
    else if(pc[i]<0.95) ramp++;
  }
  ok(ramp>20,"the ramp face is tinted across "+ramp+" vertices");
  ok(lip>0,"the takeoff lip carries a warm marker stripe ("+lip+" vertices)");
}

/* 29 — dropping straight into the park */
{
  G.setSeed(1337);
  G.setParkStart(false);
  const normal=[0,1,2,3].map(b=>G.featOf(b));
  const keyOff=G.terrainKey();
  G.setParkStart(true);
  ok(G.PARK_START===true,"the option turns on");
  ok(G.featOf(1)==="park"&&G.featOf(2)==="park","bands 1 and 2 become a 200m park");
  ok(G.featOf(0)==="open","band 0 stays open so you can build speed into it");
  ok(G.terrainKey()!==keyOff,
     "the terrain cache key changes, so cliff and kicker caches cannot go stale");
  G.loadParkStart();
  ok(G.PARK_START===true,"the choice is remembered across a reload");

  // the park you drop into must actually be reachable at speed
  G.setParkStart(true); G.resetPlayer();
  const P=G.P, IN=G.IN;
  let reached=0, air=0;
  for(let i=0;i<60*30;i++){
    IN.carve=0;IN.spin=0;IN.flip=0;IN.jump=false;IN.grabL=false;IN.hold=false;
    G.syncChunks(P.pos.z); G.stepPlayer(G.TIME/60);
    if(P.pos.z>100&&P.pos.z<300){ reached++; if(P.air) air++; }
  }
  ok(reached>0,"the rider reaches the park without steering");
  ok(air>30,"and gets airborne inside it ("+(air/60).toFixed(1)+"s of air)");
  G.setParkStart(false);
}

/* 30 — the drop-off: the helicopter must actually fly a path, hand the rider over,
   and leave the rider exactly on the spawn point when the run begins. */
{
  G.setSeed(1337); G.resetPlayer();
  const S={x:G.P.pos.x,y:G.P.pos.y,z:G.P.pos.z};
  G.introReset();
  ok(G.heli.visible===true,"the helicopter appears for the drop-off");

  const path=[], riderPath=[];
  const dt=1/60;
  for(let cd=G.INTRO_DUR; cd>0; cd-=dt){
    G.stepIntro(Math.max(0,cd),dt);
    path.push({cd,x:G.heli.position.x,y:G.heli.position.y,z:G.heli.position.z,
               ry:G.heli.rotation.y,rz:G.heli.rotation.z});
    riderPath.push({cd,y:G.rider.position.y,x:G.rider.position.x,z:G.rider.position.z});
  }

  const first=path[0], last=path[path.length-1];
  ok(first.y>S.y+40,"it comes in high above the summit ("+(first.y-S.y).toFixed(0)+"m up)");
  ok(first.z<S.z-100,"and from up the valley ("+(first.z-S.z).toFixed(0)+"m behind the spawn)");

  const hoverFrames=path.filter(p=>p.cd<=G.T_HOVER&&p.cd>1.05);
  const hoverSpread=Math.max(...hoverFrames.map(p=>Math.hypot(p.x-S.x,p.z-S.z)));
  ok(hoverSpread<0.5,"it holds a steady hover over the spawn ("+hoverSpread.toFixed(2)+"m of drift)");
  const hoverH=hoverFrames[0].y-S.y;
  ok(Math.abs(hoverH-G.HOVER_H)<1.0,"hovering at "+hoverH.toFixed(1)+"m");

  ok(Math.hypot(last.x-S.x,last.z-S.z)>60,"it leaves the scene by the end ("+
     Math.hypot(last.x-S.x,last.z-S.z).toFixed(0)+"m away)");
  ok(Math.max(...path.map(p=>Math.abs(p.rz)))>0.2,"it banks rather than sliding flat");

  // rider handover
  const hanging=riderPath.filter(r=>r.cd>G.T_RELEASE);
  ok(hanging.every(r=>r.y>S.y+3),"the rider hangs clear of the ground before release");
  const falling=riderPath.filter(r=>r.cd<=G.T_RELEASE);
  let monotonic=true;
  for(let i=1;i<falling.length;i++) if(falling[i].y>falling[i-1].y+0.01) monotonic=false;
  ok(monotonic,"the drop is a clean fall with no bounce back up");
  const end=riderPath[riderPath.length-1];
  ok(Math.abs(end.x-S.x)<0.01&&Math.abs(end.z-S.z)<0.01,
     "the rider finishes exactly on the spawn point, not beside it");
  ok(Math.abs(end.y-(S.y-0.30))<0.01,"and settled into the snow at riding height");
  ok(G.INTRO.landed===true,"the landing puff fires once the rider touches down");

  // the fall must complete before the clock runs out, or the run starts mid-air
  const touchdown=falling.find(r=>Math.abs(r.y-(S.y-0.30))<0.01);
  ok(!!touchdown&&touchdown.cd>0.25,
     "touchdown happens with "+(touchdown?touchdown.cd.toFixed(2):"0")+"s still on the clock");
}

/* 31 — the rotors turn, and the drop-off can be skipped */
{
  G.setSeed(1337); G.resetPlayer(); G.introReset();
  const before=G.heli.userData.rotor.rotation.y;
  const tailBefore=G.heli.userData.tail.rotation.x;
  for(let i=0;i<30;i++) G.stepIntro(4.0,1/60);
  ok(G.heli.userData.rotor.rotation.y>before+8,"the main rotor spins up");
  ok(G.heli.userData.tail.rotation.x>tailBefore+10,"so does the tail rotor");
  ok(G.INTRO_DUR>3&&G.INTRO_DUR<7,"the whole sequence is "+G.INTRO_DUR+"s — short enough to sit through");
  ok(G.T_RELEASE<G.T_HOVER,"the rider is released after the hover is established");
}

/* 19 — a stick with no thumb on it never writes input */
{
  const IN=G.IN;
  G.JOY.L.touch=null; G.JOY.R.touch=null;
  IN.carve=0.7; IN.spin=-0.4; IN.grab=true;
  G.readTouch();
  ok(IN.carve===0.7&&IN.spin===-0.4&&IN.grab===true,
     "idle sticks leave keyboard input untouched");
}

/* 16 — room codes are unambiguous and collision-resistant enough */
{
  const seen=new Set(); let amb=0;
  for(let i=0;i<4000;i++){ const c=G.roomCode(); seen.add(c);
    if(/[IO01]/.test(c)) amb++; }
  ok(amb===0,"no ambiguous I/O/0/1 characters in 4000 codes ("+amb+")");
  ok(seen.size>3400,"codes are well distributed ("+seen.size+" unique in 4000)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
