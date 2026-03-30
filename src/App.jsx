// src/App.jsx
import React, { useMemo, useState, useEffect, useCallback, memo } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

/* ======================= FIREBASE CONFIG REAL ======================= */
const firebaseConfig = {
  apiKey: "AIzaSyAwBnvWXLKO7ctOwmHYf4SO2CACz1D6ADI",
  authDomain: "mantenciones-v-5.firebaseapp.com",
  projectId: "mantenciones-v-5",
  storageBucket: "mantenciones-v-5.firebasestorage.app",
  messagingSenderId: "294743117767",
  appId: "1:294743117767:web:27f28d9e2276484308d3e2",
  measurementId: "G-84565JJ9L0",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
async function ensureAnonAuth(){ if(!auth.currentUser) await signInAnonymously(auth); return auth.currentUser; }

const CATEGORIES = [
  { id: "CARGADOR",   label: "Cargadores Frontales", icon: "🚜", defaultPreventive: 200 },
  { id: "CAMION",      label: "Camiones Tolva",      icon: "🚛", defaultPreventive: 300 },
  { id: "EXCAVADORA", label: "Excavadoras",          icon: "🏗️", defaultPreventive: 250 },
  { id: "CAMIONETA",  label: "Camionetas",           icon: "🛻", defaultPreventive: 0 }, 
  { id: "GENERADOR",  label: "Generadores",          icon: "⚡", defaultPreventive: 250 },
  { id: "BATEA",      label: "Bateas",               icon: "📦", defaultPreventive: 0 },
  { id: "CAMA_BAJA",  label: "Camas Bajas",          icon: "🛤️", defaultPreventive: 0 },
];

const BRAND_OPTIONS = {
  CAMION: ["Mack", "Volkswagen", "Renault"],
  CARGADOR: ["Komatsu", "Hyundai"],
  EXCAVADORA: ["Develon", "Hyundai"],
  GENERADOR: ["BSG"],
  CAMIONETA: ["Maxus", "Peugeot"],
  BATEA: ["Randon"],
  CAMA_BAJA: ["Schilger"],
};

function platesFor(categoria, marca){
  if (marca === "Mack") return ["DFLW-71", "DRHK-42", "DHXR-54", "WY-8717"]; 
  if (marca === "Volkswagen") return ["RHGC-83", "RKSC-25"];
  if (marca === "Renault") return ["SW-6114"];
  if (marca === "Komatsu") return ["SDTP-59"];
  if (marca === "Hyundai") {
    if (categoria === "CARGADOR") return ["LXDT-19"];
    if (categoria === "EXCAVADORA") return ["LVGS-87", "HDWS-49"];
  }
  if (marca === "Develon") return ["TCCW-19"];
  if (marca === "Maxus") return ["RHRB-94"];
  if (marca === "Peugeot") return ["TTVR-19"];
  if (marca === "Randon") return ["JL-8263"];
  if (marca === "Schilger") return ["JH-4921"];
  return [];
}

const OPERATORS = ["Eligio Miranda", "Patricio Obando", "Salomón Fernández", "Segundo Gómez", "Fernando Gueicha", "Francisco Bahamonde", "Pedro Espinoza", "Cecilia Sandoval", "Ignacio Echeverría"];

/* ====================== UTILIDADES ====================== */
function fmt(n,dec=0){ if(n===null||n===undefined||Number.isNaN(+n)) return "—"; return Number(n).toLocaleString("es-CL",{minimumFractionDigits:dec,maximumFractionDigits:dec}); }
const todayISO = ()=>{ const d=new Date(); d.setHours(0,0,0,0); const p=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };
function parseISO(d){ if(!d) return null; const [y,m,da]=String(d).split("-").map(Number); if(!y||!m||!da) return null; const dt=new Date(y,m-1,da); return Number.isNaN(dt.getTime())?null:dt; }
function daysBetween(a,b){ const A=parseISO(a); const B=parseISO(b||todayISO()); if(!A||!B) return 0; const ms=B.setHours(0,0,0,0)-A.setHours(0,0,0,0); return Math.round(ms/86400000); }
const WORK_SCHEDULE = { 1:9, 2:9, 3:9, 4:9, 5:8, 6:0, 0:0 };
function workingHoursBetween(a,b){
  const A=parseISO(a); const B=parseISO(b||todayISO()); if(!A||!B) return 0;
  let tot=0; const cur=new Date(A.getTime());
  while(cur<=B){ tot+=WORK_SCHEDULE[cur.getDay()]||0; cur.setDate(cur.getDate()+1); }
  return tot;
}
function addYears(iso, years=1){ const d=parseISO(iso); if(!d) return null; d.setFullYear(d.getFullYear()+years); return d.toISOString().slice(0,10); }

/* ====================== COMPONENTES UI ====================== */
const Card = ({children, className="", onClick})=> <div onClick={onClick} className={`rounded-2xl border border-slate-200 bg-white shadow-sm transition-all ${onClick ? 'cursor-pointer hover:shadow-md active:scale-[0.98]' : ''} ${className}`}>{children}</div>;
const Label = ({children, className=""})=> <label className={`text-xs font-black text-slate-900 uppercase mb-1.5 block tracking-tight ${className}`}>{children}</label>;
const Input = ({className="",...p})=> <input className={`w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-300 bg-white focus:border-blue-600 focus:outline-none transition-all text-sm text-slate-900 font-bold ${className}`} {...p}/>;
const Button = ({children, className="", variant="primary", ...p})=> {
  const base = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-black transition-all active:scale-95 text-xs uppercase";
  let styles = variant === "primary" ? "bg-blue-700 text-white hover:bg-blue-800" : (variant === "secondary" ? "bg-white border-2 border-slate-300 text-slate-900 hover:bg-slate-100" : "bg-red-600 text-white hover:bg-red-700");
  return <button className={`${base} ${styles} ${className}`} {...p}>{children}</button>;
};

const EstadoBadge = ({ estado }) => {
  const map = { VENCIDA:"bg-red-600 text-white animate-pulse", URGENTE:"bg-orange-500 text-white", PRONTO:"bg-yellow-400 text-black", OK:"bg-emerald-800 text-white" };
  const isMissing = estado && (estado.includes("LECTURA") || estado.includes("PREV") || estado.includes("GEN"));
  const style = isMissing ? "bg-black text-white border border-slate-500" : (map[estado] || "bg-slate-200 text-slate-800");
  return <span className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-md ${style}`}>{estado}</span>;
};

/* =================== TABLAS E INSUMOS (FUNCIONALIDAD COMPLETA) =================== */
function InsumosTable({ title, value = [], onChange }){
  const add = () => onChange([...value, { tipo:"Filtro", nombre:"", cant:1, enBodega: false }]);
  return (
    <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 shadow-inner">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-black text-[11px] uppercase text-slate-900 tracking-widest">{title}</h4>
        <button onClick={add} className="text-[10px] font-black text-blue-700 border-b-2 border-blue-700 uppercase">+ ITEM</button>
      </div>
      <div className="space-y-3">
        {value.map((r, i) => (
          <div key={i} className="flex flex-wrap md:flex-nowrap gap-2 items-center bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
            <select className="text-[10px] font-bold border-none bg-slate-100 rounded-lg p-1" value={r.tipo} onChange={e=>onChange(value.map((x,idx)=>idx===i?{...x, tipo:e.target.value}:x))}>
              <option>Filtro</option><option>Aceite</option><option>Otro</option>
            </select>
            <input className="text-[10px] font-bold flex-1 p-1 outline-none" placeholder="Descripción..." value={r.nombre} onChange={e=>onChange(value.map((x,idx)=>idx===i?{...x, nombre:e.target.value}:x))} />
            <div className="flex items-center gap-1">
              <input type="number" className="text-[10px] font-black w-10 text-center bg-slate-100 rounded-lg p-1" value={r.cant} onChange={e=>onChange(value.map((x,idx)=>idx===i?{...x, cant:Number(e.target.value)}:x))} />
              <span className="text-[9px] font-black text-slate-400 w-4 uppercase">{r.tipo === "Aceite" ? "L" : "un"}</span>
            </div>
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox" className="w-3 h-3" checked={r.enBodega} onChange={e=>onChange(value.map((x,idx)=>idx===i?{...x, enBodega:e.target.checked}:x))} />
              <span className="text-[9px] font-black text-slate-500 uppercase">BOD</span>
            </label>
            <button onClick={()=>onChange(value.filter((_,idx)=>idx!==i))} className="text-red-500 font-bold px-1">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =================== EDITOR DE EQUIPO =================== */
const RowEditor = memo(function RowEditor({ e, calcularEstado, updateEquipo, removeEquipo }){
  const s = calcularEstado(e);
  const cat = CATEGORIES.find(c=>c.id===e.categoria);
  const upd = (p) => updateEquipo(e.id, p);
  const esCamioneta = e.categoria === "CAMIONETA";
  const esCamion = e.categoria === "CAMION";
  const esBateaOCama = ["BATEA", "CAMA_BAJA"].includes(e.categoria);
  const sinLegal = ["CARGADOR", "EXCAVADORA", "GENERADOR"].includes(e.categoria);
  const labelMain = esCamioneta ? "Odómetro" : "Horómetro";
  const unit = esCamioneta ? "km" : "h";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in duration-500">
      <div className="lg:col-span-3 space-y-6">
        
        {/* Identificación */}
        <Card className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div><Label>Marca</Label>
              <select className="w-full text-sm border-2 border-slate-300 rounded-xl p-3 font-black text-slate-900 focus:border-blue-600 outline-none" value={e.marca} onChange={v=>upd({marca:v.target.value, patente:""})}>
                <option value="">—</option>
                {(BRAND_OPTIONS[e.categoria]||[]).map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div><Label>Patente / ID</Label>
              <select className="w-full text-sm border-2 border-slate-300 rounded-xl p-3 font-black text-blue-700 uppercase focus:border-blue-600 outline-none" value={e.patente} onChange={v=>upd({patente:v.target.value})}>
                <option value="">—</option>
                {platesFor(e.categoria, e.marca).map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            <div><Label>Operador</Label>
              <select className="w-full text-sm border-2 border-slate-300 rounded-xl p-3 font-black text-slate-900 focus:border-blue-600 outline-none" value={e.operador} onChange={v=>upd({operador:v.target.value})}>
                <option value="">—</option>
                {OPERATORS.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
          </div>

          {/* RECUADRO AZUL: LECTURA ACTUAL (MÁXIMO CONTRASTE) */}
          {!esBateaOCama && (
            <div className="mb-8 p-6 bg-blue-700 rounded-[2rem] shadow-xl border-b-8 border-blue-900">
               <div className="flex items-center gap-3 mb-6 justify-center">
                 <span className="text-2xl">📍</span>
                 <h4 className="text-xs font-black text-white uppercase tracking-[0.3em] italic">Registro de Lectura Actual</h4>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <Label className="text-blue-100 mb-2">Lectura {labelMain} ({unit})</Label>
                    <input type="number" className="w-full px-6 py-4 rounded-2xl bg-white text-blue-900 font-black text-2xl focus:ring-4 focus:ring-blue-400 outline-none shadow-inner" value={e.horaActual || ""} onChange={v=>upd({horaActual:Number(v.target.value)})}/>
                  </div>
                  <div>
                    <Label className="text-blue-100 mb-2">Fecha Lectura</Label>
                    <input type="date" className="w-full px-6 py-4 rounded-2xl bg-white text-blue-900 font-black text-lg focus:ring-4 focus:ring-blue-400 outline-none shadow-inner" value={e.horaActualFecha || ""} onChange={v=>upd({horaActualFecha: v.target.value})}/>
                  </div>
               </div>
            </div>
          )}

          {/* Registro Dual Camión */}
          {esCamion && (
            <Card className="mb-8 p-6 bg-slate-800 text-white border-none shadow-lg">
               <h4 className="text-[11px] font-black uppercase mb-4 tracking-widest italic flex items-center gap-2">
                 <span className="text-xl">🛣️</span> Registro Complementario: Odómetro (km)
               </h4>
               <div className="grid grid-cols-2 gap-6">
                  <input type="number" className="w-full px-5 py-3 rounded-xl bg-slate-700 text-white font-black text-xl outline-none" placeholder="Km actual..." value={e.odometro || ""} onChange={v=>upd({odometro: Number(v.target.value)})}/>
                  <input type="date" className="w-full px-5 py-3 rounded-xl bg-slate-700 text-white font-bold outline-none" value={e.odometroFecha || ""} onChange={v=>upd({odometroFecha: v.target.value})}/>
               </div>
            </Card>
          )}

          {/* Configuración */}
          {!esBateaOCama && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="p-5 bg-slate-50 rounded-2xl border-2 border-slate-200">
                <Label className="text-slate-500 mb-4 tracking-widest">Plan de Mantenimiento</Label>
                <div className="grid grid-cols-2 gap-4">
                  {!esCamioneta && <div><Label>Prev cada ({unit})</Label><Input type="number" value={e.preventivaCada || ""}/></div>}
                  <div><Label>Gen cada ({unit})</Label><Input type="number" value={e.generalCada || ""}/></div>
                  <div className="col-span-2"><Label>{unit} Proyectadas/Día</Label><Input type="number" value={e.horasDiariasOverride || ""}/></div>
                </div>
              </div>
              <div className="p-5 bg-slate-50 rounded-2xl border-2 border-slate-200">
                <Label className="text-slate-500 mb-4 tracking-widest">Últimas Intervenciones</Label>
                <div className="grid grid-cols-2 gap-4">
                  {!esCamioneta && <div><Label>Últ. Prev ({unit})</Label><Input type="number" value={e.ultimaPreventivaHora || ""}/></div>}
                  <div><Label>Últ. Gen ({unit})</Label><Input type="number" value={e.ultimaGeneralHora || ""}/></div>
                  {!sinLegal && (
                    <>
                      <div><Label>Vence RT</Label><Input type="date" value={e.rtUltima || ""}/></div>
                      <div><Label>Vence PC</Label><Input type="date" value={e.pcUltimo || ""}/></div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {!esCamioneta && !esBateaOCama && <InsumosTable title="Insumos Preventiva" value={e.insumosPrev} onChange={v=>upd({insumosPrev:v})}/>}
            {!esBateaOCama && <InsumosTable title="Insumos General" value={e.insumosGen} onChange={v=>upd({insumosGen:v})}/>}
          </div>
        </Card>
      </div>

      {/* PANEL LATERAL: ESTATUS VERDE (ALTA VISIBILIDAD) */}
      <div className="space-y-4">
        {!esBateaOCama ? (
          <Card className="p-6 bg-slate-50 border-2 border-slate-200 text-slate-900">
            <h4 className="text-[11px] font-black uppercase tracking-[0.2em] mb-8 text-emerald-100 italic text-center">Estatus de Ciclo</h4>
            <div className="space-y-10">
              
              {!esCamioneta && (
                <div className="relative">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black uppercase text-slate-500">Próx. Preventiva</span>
                    <EstadoBadge estado={s.estPrev} />
                  </div>
                  <p className="text-4xl font-black italic tracking-tighter text-black leading-none">
                    {s.estPrev.includes("LECTURA") || s.estPrev.includes("PREV") ? "—" : `${fmt(s.proxPrev)} ${unit}`}
                  </p>
                  {!s.estPrev.includes("LECTURA") && !s.estPrev.includes("PREV") && (
                     <p className="text-[12px] font-black text-blue-700 mt-2 uppercase">
                        {s.estPrev === "VENCIDA" ? "PASADO POR:" : "Restan:"} {fmt(Math.max(0, s.restPrev))} {unit}
                     </p>
                  )}
                  <button onClick={()=>{if(window.confirm(`¿Registrar Prev?`)) upd({ultimaPreventivaHora: s.horaActual})}} className="w-full mt-4 bg-emerald-800 text-white py-3 rounded-xl font-black text-[10px] uppercase shadow-md hover:bg-emerald-50 transition-all">Registrar Prev.</button>
                </div>
              )}

              <div className={`${!esCamioneta ? 'border-t-2 border-emerald-600 pt-8' : ''}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-black uppercase text-emerald-200">Próx. General</span>
                  <EstadoBadge estado={s.estGen} />
                </div>
                <p className="text-4xl font-black italic tracking-tighter text-white leading-none">
                  {s.estGen.includes("LECTURA") || s.estGen.includes("GEN") ? "—" : `${fmt(s.proxGen)} ${unit}`}
                </p>
                {!s.estGen.includes("LECTURA") && !s.estGen.includes("GEN") && (
                   <p className="text-[12px] font-black text-emerald-100 mt-2 uppercase">
                      {s.estGen === "VENCIDA" ? "PASADO POR:" : "Restan:"} {fmt(Math.max(0, s.restGen))} {unit}
                   </p>
                )}
                <button onClick={()=>{if(window.confirm(`¿Registrar Gen?`)) upd({ultimaGeneralHora: s.horaActual})}} className="w-full mt-4 bg-emerald-900 text-white py-3 rounded-xl font-black text-[10px] uppercase shadow-md hover:bg-emerald-950 transition-all">Registrar Gen.</button>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6 bg-slate-900 text-white shadow-xl">
             <h4 className="text-[10px] font-black uppercase text-slate-400 mb-6 tracking-widest text-center italic">Control Legal</h4>
             <div className="space-y-6">
                <div className="flex justify-between"><span>RT</span><EstadoBadge estado={estadoPorDias(daysBetween(todayISO(), addYears(e.rtUltima || todayISO(), 1)), 30)} /></div>
                <div className="flex justify-between"><span>PC</span><EstadoBadge estado={estadoPorDias(daysBetween(todayISO(), addYears(e.pcUltimo || todayISO(), 1)), 30)} /></div>
             </div>
          </Card>
        )}
        <Button variant="danger" className="w-full py-4 tracking-widest" onClick={()=>removeEquipo(e.id)}>Dar de baja</Button>
      </div>
    </div>
  );
});

/* =========================== APP PRINCIPAL =========================== */
export default function AppMantenciones(){
  const [equipos, setEquipos] = useState([]);
  const [view, setView] = useState({ cat: null, id: null });

  useEffect(()=>{
    let unsub=null;
    ensureAnonAuth().then(()=>{
      unsub = onSnapshot(collection(db,"equipos"), snap => setEquipos(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
    });
    return ()=>unsub && unsub();
  },[]);

  const calcularEstado = useCallback((e)=>{
    const esCamioneta = e.categoria === "CAMIONETA";
    if (["BATEA", "CAMA_BAJA"].includes(e.categoria)) return { salud: "OK", estPrev: "OK", estGen: "OK" };

    const cat = CATEGORIES.find(c=>c.id===e.categoria);
    const prevCada = Number(e.preventivaCada ?? cat?.defaultPreventive ?? 250);
    const genCada = Number(e.generalCada || (esCamioneta ? 5000 : 2000));
    
    let estPrev = "OK", estGen = "OK";
    const prontoLim = esCamioneta ? 1000 : 120;
    const urgenteLim = esCamioneta ? 500 : 40;

    const elapsed = e.horaActualFecha ? (e.horasDiariasOverride > 0 ? daysBetween(e.horaActualFecha, todayISO()) * e.horasDiariasOverride : workingHoursBetween(e.horaActualFecha, todayISO())) : 0;
    const horaActual = Number(e.horaActual||0) + Math.max(0, elapsed);

    if (!esCamioneta) {
        if (!e.horaActual || e.horaActual === 0) { estPrev = "⚠️ LECTURA"; }
        else if (!e.ultimaPreventivaHora || e.ultimaPreventivaHora === 0) { estPrev = "⚙️ PREV"; }
        else {
          const prox = Number(e.ultimaPreventivaHora) + prevCada;
          const rest = prox - horaActual;
          if (rest <= 0) estPrev = "VENCIDA";
          else if (rest <= urgenteLim) estPrev = "URGENTE";
          else if (rest <= prontoLim) estPrev = "PRONTO";
        }
    }

    if (!e.horaActual || e.horaActual === 0) { estGen = "⚠️ LECTURA"; }
    else if (!e.ultimaGeneralHora || e.ultimaGeneralHora === 0) { estGen = "🛠️ GEN"; }
    else {
        const prox = Number(e.ultimaGeneralHora) + genCada;
        const rest = prox - horaActual;
        if (rest <= 0) estGen = "VENCIDA";
        else if (rest <= urgenteLim) estGen = "URGENTE";
        else if (rest <= prontoLim) estGen = "PRONTO";
    }

    const priority = { VENCIDA: 6, URGENTE: 5, "⚠️ LECTURA": 4, "⚙️ PREV": 3, "🛠️ GEN": 2, PRONTO: 1, OK: 0 };
    let worst = esCamioneta ? estGen : (priority[estPrev] >= priority[estGen] ? estPrev : estGen);

    return { 
      horaActual, 
      proxPrev: (Number(e.ultimaPreventivaHora||0) + prevCada), 
      proxGen: (Number(e.ultimaGeneralHora||0) + genCada), 
      restPrev: ((Number(e.ultimaPreventivaHora||0) + prevCada) - horaActual),
      restGen: ((Number(e.ultimaGeneralHora||0) + genCada) - horaActual),
      estPrev, estGen, salud: worst 
    };
  }, []);

  if (!view.cat) {
    return (
      <div className="p-6 max-w-6xl mx-auto min-h-screen bg-slate-50 font-sans text-slate-900 text-left">
        <header className="mb-10 flex justify-between items-end border-b-4 border-slate-900 pb-6">
          <div><h1 className="text-6xl font-black tracking-tighter uppercase italic text-slate-950 leading-none">VIA 5</h1><p className="font-black text-blue-700 uppercase text-[12px] tracking-[0.3em] mt-3">GESTIÓN DE FLOTA</p></div>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {CATEGORIES.map(c => {
            const unidades = equipos.filter(e => e.categoria === c.id);
            const statusList = unidades.map(e => calcularEstado(e).salud);
            const esCritico = statusList.some(s => ["VENCIDA","URGENTE"].includes(s));
            const esFalta = statusList.some(s => s.includes("LECTURA") || s.includes("PREV") || s.includes("GEN"));
            return (
              <Card key={c.id} onClick={() => setView({ cat: c.id, id: null })} className="p-10 group hover:border-slate-400 shadow-lg border-2 border-slate-200">
                <div className="flex justify-between items-start mb-8">
                  <span className="text-8xl group-hover:scale-110 transition-transform duration-300">{c.icon}</span>
                  {unidades.length > 0 && <span className={`px-4 py-1 rounded-full text-[12px] font-black ${esCritico ? 'bg-red-600 text-white animate-pulse' : (esFalta ? 'bg-black text-white' : 'bg-slate-200 text-slate-900')}`}>{unidades.length}</span>}
                </div>
                <h3 className="text-2xl font-black text-slate-950 uppercase italic">{c.label}</h3>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  if (view.cat && !view.id) {
    const cat = CATEGORIES.find(c => c.id === view.cat);
    return (
      <div className="p-6 max-w-6xl mx-auto min-h-screen bg-slate-50 text-left">
        <div className="flex items-center gap-6 mb-10">
          <Button variant="secondary" onClick={() => setView({ cat: null, id: null })} className="rounded-full w-14 h-14 p-0 text-2xl font-black border-slate-400">←</Button>
          <h2 className="text-5xl font-black uppercase italic tracking-tighter text-slate-950">{cat.icon} {cat.label}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {equipos.filter(e => e.categoria === view.cat).map(e => (
            <Card key={e.id} onClick={() => setView({ ...view, id: e.id })} className="p-8 border-l-[20px] border-l-blue-700 shadow-xl bg-white">
              <div className="font-black text-3xl mb-2 text-slate-950 tracking-tighter uppercase">{e.patente || "S/P"}</div>
              <div className="text-[11px] font-black text-slate-400 mb-6 uppercase tracking-widest">{e.marca || "N/A"}</div>
              <EstadoBadge estado={calcularEstado(e).salud} />
            </Card>
          ))}
          <button onClick={() => {
            const base = { categoria: view.cat, marca:"", patente:"", horaActual:0, horaActualFecha: todayISO(), ultimaPreventivaHora:0, ultimaGeneralHora:0, insumosPrev: [], insumosGen: [], documentos: [], notas: "", updatedAt: serverTimestamp() };
            addDoc(collection(db,"equipos"), base).then(d => setView({...view, id: d.id}));
          }} className="border-4 border-dashed border-slate-300 rounded-[2rem] p-8 flex flex-col items-center justify-center text-slate-300 hover:text-blue-700 hover:border-blue-700 transition-all font-black uppercase text-xl">+ NUEVO</button>
        </div>
      </div>
    );
  }

  const equipoActual = equipos.find(x => x.id === view.id);
  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen bg-slate-50 text-slate-900 text-left">
      <div className="mb-10 flex justify-between items-center bg-white p-8 rounded-[2rem] shadow-md border-2 border-slate-100">
        <Button variant="secondary" onClick={() => setView({ ...view, id: null })} className="px-8 border-slate-300">← VOLVER</Button>
        <div className="text-right">
          <p className="text-[12px] font-black text-blue-700 uppercase tracking-[0.2em] leading-none mb-1">FICHA TÉCNICA</p>
          <h2 className="text-4xl font-black text-slate-950 italic uppercase tracking-tighter leading-none">{equipoActual?.patente || "SIN IDENTIFICAR"}</h2>
        </div>
      </div>
      {equipoActual && <RowEditor e={equipoActual} calcularEstado={calcularEstado} updateEquipo={(id, p) => updateDoc(doc(db, "equipos", id), { ...p, updatedAt: serverTimestamp() })} removeEquipo={(id) => { if(window.confirm("¿ELIMINAR ACTIVO?")) { deleteDoc(doc(db,"equipos",id)); setView({...view, id: null}); } }} />}
    </div>
  );
}

function estadoPorDias(dias, horizonte){
  if(dias<=0) return "VENCIDA"; if(dias<=7) return "URGENTE"; if(dias<=horizonte) return "PRONTO"; return "OK";
}