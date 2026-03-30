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
  { id: "CAMIONETA",  label: "Camionetas",           icon: "🛻", defaultPreventive: 0 }, // Estandarizado: 0 Prev para camionetas
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

/* ====================== COMPONENTES UI ESTANDARIZADOS ====================== */
const Card = ({children, className="", onClick})=> <div onClick={onClick} className={`rounded-2xl border border-slate-200 bg-white shadow-sm transition-all ${onClick ? 'cursor-pointer hover:shadow-md active:scale-[0.98]' : ''} ${className}`}>{children}</div>;
const Label = ({children, className=""})=> <label className={`text-xs font-black text-slate-800 uppercase mb-1.5 block tracking-tight ${className}`}>{children}</label>;
const Input = ({className="",...p})=> <input className={`w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-300 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all text-sm text-slate-900 font-bold ${className}`} {...p}/>;
const Button = ({children, className="", variant="primary", ...p})=> {
  const base = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-black transition-all active:scale-95 text-xs uppercase tracking-tighter";
  let styles = variant === "primary" ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm" : (variant === "secondary" ? "bg-white border-2 border-slate-200 text-slate-900 hover:bg-slate-100" : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100");
  return <button className={`${base} ${styles} ${className}`} {...p}>{children}</button>;
};

const EstadoBadge = ({ estado }) => {
  const map = { 
    VENCIDA:"bg-red-600 text-white animate-pulse", 
    URGENTE:"bg-orange-500 text-white", 
    PRONTO:"bg-yellow-400 text-slate-900", 
    OK:"bg-emerald-600 text-white" 
  };
  const isMissing = estado && (estado.includes("LECTURA") || estado.includes("PREV") || estado.includes("GEN"));
  const style = isMissing ? "bg-slate-900 text-white border border-slate-600" : (map[estado] || "bg-slate-100 text-slate-800");
  return <span className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-sm whitespace-nowrap tracking-tight ${style}`}>{estado}</span>;
};

/* =================== EDITOR DE EQUIPO (MÓDULO UNIFICADO) =================== */
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
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in duration-500 text-slate-900">
      <div className="lg:col-span-3 space-y-6">
        
        {/*Identificación del Activo - Estandarizado */}
        <Card className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div><Label>Marca del Equipo</Label>
              <select className="w-full text-sm border-2 border-slate-300 rounded-xl p-3 bg-white font-black text-slate-900 focus:border-blue-500 focus:outline-none" value={e.marca} onChange={v=>upd({marca:v.target.value, patente:""})}>
                <option value="">— Seleccionar —</option>
                {(BRAND_OPTIONS[e.categoria]||[]).map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div><Label>Patente / ID</Label>
              <select className="w-full text-sm border-2 border-slate-300 rounded-xl p-3 bg-white font-black text-blue-700 uppercase focus:border-blue-500 focus:outline-none" value={e.patente} onChange={v=>upd({patente:v.target.value})}>
                <option value="">— Seleccionar —</option>
                {platesFor(e.categoria, e.marca).map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            <div><Label>Operador Responsable</Label>
              <select className="w-full text-sm border-2 border-slate-300 rounded-xl p-3 bg-white font-black text-slate-900 focus:border-blue-500 focus:outline-none" value={e.operador} onChange={v=>upd({operador:v.target.value})}>
                <option value="">— Seleccionar —</option>
                {OPERATORS.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
          </div>

          {/* LECTURA ACTUAL - Estandarizado visualmente (Card Blanca, sin grandes sombras ni degradados fuertes) */}
          {!esBateaOCama && (
            <div className="mb-8 p-6 bg-slate-50 rounded-[2rem] border border-blue-200">
               <div className="flex items-center gap-3 mb-4 justify-center">
                 <span className="text-2xl">📍</span>
                 <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.2em] italic">Registro de Lectura Actual</h4>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <Label className="text-slate-800 mb-2">Lectura de {labelMain} ({unit})</Label>
                    <input 
                      type="number" 
                      className="w-full px-6 py-4 rounded-2xl border-2 border-slate-300 bg-white text-slate-950 font-black text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all" 
                      placeholder="0.0"
                      value={e.horaActual || ""} 
                      onChange={v=>upd({horaActual:Number(v.target.value)})}
                    />
                  </div>
                  <div>
                    <Label className="text-slate-800 mb-2">Fecha de esta Lectura</Label>
                    <input 
                      type="date" 
                      className="w-full px-6 py-4 rounded-2xl border-2 border-slate-300 bg-white text-slate-950 font-black text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none" 
                      value={e.horaActualFecha || ""} 
                      onChange={v=>upd({horaActualFecha: v.target.value})}
                    />
                  </div>
               </div>
            </div>
          )}

          {/* Registro Dual para Camiones - Estandarizado (Exactamente igual que las otras tarjetas) */}
          {esCamion && (
            <Card className="mb-8 p-6 bg-white border border-slate-300">
               <h4 className="text-[11px] font-black text-slate-800 uppercase mb-4 tracking-widest italic flex items-center gap-2">
                 <span className="text-xl">🛣️</span> Registro Complementario: Odómetro (km)
               </h4>
               <div className="grid grid-cols-2 gap-6">
                  <input type="number" className="w-full px-5 py-3 rounded-xl border-2 border-slate-300 bg-white text-slate-900 font-bold text-base focus:border-blue-500 focus:outline-none" placeholder="Km actual..." value={e.odometro || ""} onChange={v=>upd({odometro: Number(v.target.value)})}/>
                  <input type="date" className="w-full px-5 py-3 rounded-xl border-2 border-slate-300 bg-white text-slate-900 font-bold focus:border-blue-500 focus:outline-none" value={e.odometroFecha || ""} onChange={v=>upd({odometroFecha: v.target.value})}/>
               </div>
            </Card>
          )}

          {/* Planificación y Útimas Mantenciones */}
          {!esBateaOCama && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
                <h5 className="text-[11px] font-black uppercase text-slate-600 mb-4 tracking-widest">Plan de Mantenimiento</h5>
                <div className="grid grid-cols-2 gap-4">
                  {!esCamioneta && <div><Label>Prev cada ({unit})</Label><Input type="number" placeholder={cat?.defaultPreventive} value={e.preventivaCada || ""} onChange={v=>upd({preventivaCada: Number(v.target.value)})}/></div>}
                  <div><Label>Gen cada ({unit})</Label><Input type="number" value={e.generalCada || (esCamioneta ? 5000 : 2000)} onChange={v=>upd({generalCada:Number(v.target.value)})}/></div>
                  <div className="col-span-2"><Label>{esCamioneta ? "Km" : "Horas"} Diarias (Proyección)</Label><Input type="number" value={e.horasDiariasOverride || ""} onChange={v=>upd({horasDiariasOverride: Number(v.target.value)})}/></div>
                </div>
              </div>
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
                <h5 className="text-[11px] font-black uppercase text-slate-600 mb-4 tracking-widest">Últimas Realizadas</h5>
                <div className="grid grid-cols-2 gap-4">
                  {!esCamioneta && <div><Label>Última Prev ({unit})</Label><Input type="number" value={e.ultimaPreventivaHora || ""} onChange={v=>upd({ultimaPreventivaHora:Number(v.target.value)})}/></div>}
                  <div><Label>Última Gen ({unit})</Label><Input type="number" value={e.ultimaGeneralHora || ""} onChange={v=>upd({ultimaGeneralHora:Number(v.target.value)})}/></div>
                  {!sinLegal && (
                    <>
                      <div><Label>Vence RT</Label><Input type="date" value={e.rtUltima || ""} onChange={v=>upd({rtUltima:v.target.value})}/></div>
                      <div><Label>Vence PC</Label><Input type="date" value={e.pcUltimo || ""} onChange={v=>upd({pcUltimo:v.target.value})}/></div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {esBateaOCama && (
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div><Label>Vence Revisión Técnica</Label><Input type="date" value={e.rtUltima || ""} onChange={v=>upd({rtUltima:v.target.value})}/></div>
              <div><Label>Vence Permiso de Circulación</Label><Input type="date" value={e.pcUltimo || ""} onChange={v=>upd({pcUltimo:v.target.value})}/></div>
            </div>
          )}

          <div className="mb-8"><Label>Notas de Terreno</Label><textarea className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 focus:border-blue-500 text-sm h-24 text-slate-900 font-bold" value={e.notas || ""} onChange={v=>upd({notas:v.target.value})} placeholder="Escribir fallas o pendientes aquí..."/></div>

          {!esBateaOCama && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {!esCamioneta && <InsumosTable title="Insumos Preventiva" value={e.insumosPrev} onChange={v=>upd({insumosPrev:v})}/>}
              <InsumosTable title="Insumos General" value={e.insumosGen} onChange={v=>upd({insumosGen:v})}/>
            </div>
          )}
        </Card>
      </div>

      {/* PANEL LATERAL: ESTADOS INDEPENDIENTES Y ALTA VISIBILIDAD (Texto Negro) */}
      <div className="space-y-4">
        {!esBateaOCama ? (
          <Card className="p-6 bg-white border-2 border-slate-200 shadow-xl text-slate-900 text-left">
            <h4 className="text-[11px] font-black uppercase tracking-widest mb-8 text-slate-600 italic text-center">Estatus de Ciclo</h4>
            <div className="space-y-10">
              
              {/* Bloque Preventiva - Texto Negro Intenso (maximum contrast) - OCULTO PARA CAMIONETAS */}
              {!esCamioneta && (
                <div className="relative">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black uppercase text-slate-600">Próx. Preventiva</span>
                    <EstadoBadge estado={s.estPrev} />
                  </div>
                  <p className="text-3xl font-black italic tracking-tighter text-black leading-none">
                    {s.estPrev.includes("LECTURA") || s.estPrev.includes("PREV") ? "—" : `${fmt(s.proxPrev)} ${unit}`}
                  </p>
                  {!s.estPrev.includes("LECTURA") && !s.estPrev.includes("PREV") && (
                     <p className="text-[11px] font-black text-black mt-2 uppercase">
                        {s.estPrev === "VENCIDA" ? "PASADO POR:" : "Restan:"} {fmt(Math.max(0, s.restPrev))} {unit}
                     </p>
                  )}
                  <button onClick={()=>{if(window.confirm(`¿Registrar Preventiva realizada ahora?`)) upd({ultimaPreventivaHora: s.horaActual})}} className="w-full mt-4 bg-slate-900 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-tighter hover:bg-blue-600 transition-all shadow-md">Registrar Prev.</button>
                </div>
              )}

              {/* Bloque General - Texto Negro Intenso (maximum contrast) - SIEMPRE VISIBLE */}
              <div className={`${!esCamioneta ? 'border-t-2 border-slate-100 pt-8' : ''} relative`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-black uppercase text-slate-600">Próx. General</span>
                  <EstadoBadge estado={s.estGen} />
                </div>
                <p className="text-3xl font-black italic tracking-tighter text-black leading-none">
                  {s.estGen.includes("LECTURA") || s.estGen.includes("GEN") ? "—" : `${fmt(s.proxGen)} ${unit}`}
                </p>
                {!s.estGen.includes("LECTURA") && !s.estGen.includes("GEN") && (
                   <p className="text-[11px] font-black text-black mt-2 uppercase">
                      {s.estGen === "VENCIDA" ? "PASADO POR:" : "Restan:"} {fmt(Math.max(0, s.restGen))} {unit}
                   </p>
                )}
                <button onClick={()=>{if(window.confirm(`¿Registrar General realizada ahora?`)) upd({ultimaGeneralHora: s.horaActual})}} className="w-full mt-4 bg-white text-slate-900 py-3 rounded-xl font-black text-[10px] uppercase tracking-tighter hover:bg-slate-200 border-2 border-slate-200 transition-all shadow-sm">Registrar Gen.</button>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6 bg-slate-900 text-white shadow-xl border border-slate-700">
             <h4 className="text-[10px] font-black uppercase text-slate-400 mb-6 tracking-widest text-center italic">Estatus Legal</h4>
             <div className="space-y-6">
                <div><Label className="text-slate-400">R. Técnica</Label><EstadoBadge estado={estadoPorDias(daysBetween(todayISO(), addYears(e.rtUltima || todayISO(), 1)), 30)} /></div>
                <div><Label className="text-slate-400">P. Circulación</Label><EstadoBadge estado={estadoPorDias(daysBetween(todayISO(), addYears(e.pcUltimo || todayISO(), 1)), 30)} /></div>
             </div>
          </Card>
        )}
        <Button variant="danger" className="w-full py-4 opacity-70 hover:opacity-100" onClick={()=>removeEquipo(e.id)}>Dar de baja Activo</Button>
      </div>
    </div>
  );
});

/* =================== TABLAS E INSUMOS =================== */
function InsumosTable({ title, value = [], onChange }){
  const add = () => onChange([...value, { tipo:"Filtro", nombre:"", cant:1 }]);
  return (
    <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 shadow-inner">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-black text-[10px] uppercase text-slate-500 tracking-widest">{title}</h4>
        <button onClick={add} className="text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-tighter border-b-2 border-blue-600">+ AGREGAR</button>
      </div>
      <div className="space-y-2">
        {value.map((r, i) => (
          <div key={i} className="flex gap-2 items-center border-b border-slate-100 pb-2 text-slate-900">
            <input className="text-[10px] border-none bg-slate-100 rounded p-1 w-10 font-black text-slate-900" type="number" value={r.cant} onChange={e=>onChange(value.map((x,idx)=>idx===i?{...x, cant:Number(e.target.value)}:x))} />
            <input className="text-[10px] border-none bg-slate-100 rounded flex-1 p-1 font-bold text-slate-900" placeholder="Nombre..." value={r.nombre} onChange={e=>onChange(value.map((x,idx)=>idx===i?{...x, nombre:e.target.value}:x))} />
            <button onClick={()=>onChange(value.filter((_,idx)=>idx!==i))} className="text-red-400 font-bold px-1 text-xs">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

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
    
    // Lógica de errores individuales (Punto 3 Real: Independencia)
    let estPrev = "OK", estGen = "OK";
    const prontoLim = esCamioneta ? 1000 : 120;
    const urgenteLim = esCamioneta ? 500 : 40;

    // Cálculo de hora actual proyectada
    const elapsed = e.horaActualFecha ? (e.horasDiariasOverride > 0 ? daysBetween(e.horaActualFecha, todayISO()) * e.horasDiariasOverride : workingHoursBetween(e.horaActualFecha, todayISO())) : 0;
    const horaActual = Number(e.horaActual||0) + Math.max(0, elapsed);

    // Validación Preventiva (Ignorar para Camionetas)
    if (!esCamioneta) {
        if (!e.horaActual || e.horaActual === 0) { estPrev = "⚠️ INGRESAR LECTURA"; }
        else if (!e.ultimaPreventivaHora || e.ultimaPreventivaHora === 0) { estPrev = "⚙️ CONFIG. PREV"; }
        else {
          const prox = Number(e.ultimaPreventivaHora) + prevCada;
          const rest = prox - horaActual;
          if (rest <= 0) estPrev = "VENCIDA"; // Corrección: Negative is Vencida
          else if (rest <= urgenteLim) estPrev = "URGENTE";
          else if (rest <= prontoLim) estPrev = "PRONTO";
        }
    }

    // Validación General
    if (!e.horaActual || e.horaActual === 0) { estGen = "⚠️ INGRESAR LECTURA"; }
    else if (!e.ultimaGeneralHora || e.ultimaGeneralHora === 0) { estGen = "🛠️ CONFIG. GEN"; }
    else {
        const prox = Number(e.ultimaGeneralHora) + genCada;
        const rest = prox - horaActual;
        if (rest <= 0) estGen = "VENCIDA"; // Corrección: Negative is Vencida
        else if (rest <= urgenteLim) estGen = "URGENTE";
        else if (rest <= prontoLim) estGen = "PRONTO";
    }

    const priority = { VENCIDA: 6, URGENTE: 5, "⚠️ INGRESAR LECTURA": 4, "⚙️ CONFIG. PREV": 3, "🛠️ CONFIG. GEN": 2, PRONTO: 1, OK: 0 };
    
    // Worrst logic depends on category
    let worst = "OK";
    if (esCamioneta) {
        worst = estGen; // Only General for trucks
    } else {
        worst = priority[estPrev] >= priority[estGen] ? estPrev : estGen;
    }

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
        <header className="mb-10 flex justify-between items-end border-b-4 border-slate-200 pb-6">
          <div><h1 className="text-5xl font-black tracking-tighter uppercase italic text-black leading-none">VIA 5</h1><p className="font-black text-blue-600 uppercase text-[11px] tracking-widest mt-2">GESTIÓN EFESA INGENIERIA</p></div>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {CATEGORIES.map(c => {
            const unidades = equipos.filter(e => e.categoria === c.id);
            const statusList = unidades.map(e => calcularEstado(e).salud);
            const esCritico = statusList.some(s => ["VENCIDA","URGENTE"].includes(s));
            const esFalta = statusList.some(s => s.includes("LECTURA") || s.includes("PREV") || s.includes("GEN"));
            return (
              <Card key={c.id} onClick={() => setView({ cat: c.id, id: null })} className="p-8 group hover:border-slate-300 shadow-sm transition-all duration-300 border border-slate-200 bg-white">
                <div className="flex justify-between items-start mb-6">
                  <span className="text-7xl group-hover:scale-110 transition-transform duration-300">{c.icon}</span>
                  {unidades.length > 0 && <span className={`px-3 py-1 rounded-full text-[10px] font-black ${esCritico ? 'bg-red-600 text-white animate-pulse' : (esFalta ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800')}`}>{unidades.length} UNIDS</span>}
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase italic leading-none">{c.label}</h3>
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
        <div className="flex items-center gap-4 mb-10 text-slate-900">
          <Button variant="secondary" onClick={() => setView({ cat: null, id: null })} className="rounded-full w-12 h-12 p-0 text-xl font-black border-slate-300 shadow-sm">←</Button>
          <h2 className="text-4xl font-black uppercase italic tracking-tighter text-black">{cat.icon} {cat.label}</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {equipos.filter(e => e.categoria === view.cat).map(e => (
            <Card key={e.id} onClick={() => setView({ ...view, id: e.id })} className="p-6 border-l-[16px] border-l-blue-600 shadow-md hover:shadow-xl transition-all border-slate-200 bg-white">
              <div className="font-black text-2xl mb-1 text-black tracking-tighter uppercase">{e.patente || "S/P"}</div>
              <div className="text-[10px] font-black text-slate-500 mb-6 uppercase tracking-widest">{e.marca || "No definida"}</div>
              <div className="text-left"><EstadoBadge estado={calcularEstado(e).salud} /></div>
            </Card>
          ))}
          <button onClick={() => {
            const base = { categoria: view.cat, marca:"", patente:"", horaActual:0, horaActualFecha: todayISO(), ultimaPreventivaHora:0, ultimaGeneralHora:0, insumosPrev: [], insumosGen: [], documentos: [], notas: "", updatedAt: serverTimestamp() };
            addDoc(collection(db,"equipos"), base).then(d => setView({...view, id: d.id}));
          }} className="border-4 border-dashed border-slate-300 rounded-3xl p-6 flex flex-col items-center justify-center text-slate-300 hover:text-blue-600 hover:border-blue-600 transition-all font-black uppercase text-xl">+ NUEVO</button>
        </div>
      </div>
    );
  }

  const equipoActual = equipos.find(x => x.id === view.id);
  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen bg-slate-50 text-slate-900 text-left">
      <div className="mb-8 flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <Button variant="secondary" onClick={() => setView({ ...view, id: null })}>← Listado de Flota</Button>
        <div className="text-right">
          <p className="text-[11px] font-black text-blue-600 uppercase tracking-widest leading-none">EXPEDIENTE DE EQUIPO</p>
          <h2 className="text-3xl font-black text-slate-950 italic uppercase tracking-tighter leading-none">{equipoActual?.patente || "NUEVO"}</h2>
        </div>
      </div>
      {equipoActual && <RowEditor e={equipoActual} calcularEstado={calcularEstado} updateEquipo={(id, p) => updateDoc(doc(db, "equipos", id), { ...p, updatedAt: serverTimestamp() })} removeEquipo={(id) => { if(window.confirm("¿Eliminar este equipo permanentemente de la base de datos?")) { deleteDoc(doc(db,"equipos",id)); setView({...view, id: null}); } }} />}
    </div>
  );
}

function estadoPorDias(dias, horizonte){
  if(dias<=0) return "VENCIDA"; if(dias<=7) return "URGENTE"; if(dias<=horizonte) return "PRONTO"; return "OK";
}