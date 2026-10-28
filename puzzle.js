'use strict';
class KanjiPuzzle {
  constructor(level){
    if(level){
      this.level=level;this.edges=level.edges.map(e=>e.map(p=>[...p]));this.start=[...level.start];this.goal=[...level.goal];
      this.all=new Set(this.edges.map(([a,b])=>this.key(a,b)));this.core=new Set(level.core.map(([a,b])=>this.key(a,b)));this.setBounds();this.reset();return;
    }
    this.edges=[];this.start=[0,3];this.goal=[4,3];
    const line=(a,b)=>{let p=[...a];while(p[0]!==b[0]||p[1]!==b[1]){const q=[p[0]+Math.sign(b[0]-p[0]),p[1]+Math.sign(b[1]-p[1])];this.edges.push([p,q]);p=q;}};
    line([0,0],[4,0]);line([0,3],[4,3]);line([0,6],[4,6]);line([0,0],[0,6]);line([4,0],[4,6]);
    this.all=new Set(this.edges.map(([a,b])=>this.key(a,b)));this.core=new Set(this.all);this.level={char:'日',reading:'ひ',id:1};this.setBounds();this.reset();
  }
  setBounds(){const points=this.edges.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);this.bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};}
  key(a,b){return [a.join(','),b.join(',')].sort().join('|');}
  reset(){this.position=[...this.start];this.path=[[...this.start]];this.used=new Set();this.state='ready';}
  available(){return [[0,-1],[1,0],[0,1],[-1,0]].filter(([x,y])=>{const q=[this.position[0]+x,this.position[1]+y],key=this.key(this.position,q);return this.all.has(key)&&!this.used.has(key);});}
  move(dx,dy){
    if(!['ready','playing'].includes(this.state)||!Number.isInteger(dx)||!Number.isInteger(dy)||Math.abs(dx)+Math.abs(dy)!==1)return false;
    const q=[this.position[0]+dx,this.position[1]+dy],key=this.key(this.position,q);
    if(!this.all.has(key)||this.used.has(key))return false;
    this.used.add(key);this.position=q;this.path.push(q);this.state=this.used.size===this.all.size?'won':this.available().length?'playing':'lost';return true;
  }
}
if(typeof module!=='undefined')module.exports=KanjiPuzzle;
