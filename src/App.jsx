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

/* =================== CONFIGURACIÓN DE FLOTA =================== */
const CATEGORIES = [
  { id: "CARGADOR",   label: "Cargadores Frontales", icon: "🚜", defaultPreventive: 200 },
  { id: "CAMION",      label: "Camiones Tolva",      icon: "🚛", defaultPreventive: 300 },
  { id: "EXCAVADORA", label: "Excavadoras",          icon: "🏗️", defaultPreventive: 250 },
  { id: "CAMIONETA",  label: "Camionetas",           icon: "🛻", defaultPreventive: 5000 },
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
  if (marca === "Mack") return ["DFLW-71", "DRHK-42", "DHXR-54", "WY-8717"]; // DHXR-54 CORREGIDA (Punto 6)
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

/* ======================== UTILIDADES ======================== */
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
const Card = ({children, className="", onClick})=> <div onClick={onClick} className={`rounded-2xl border bg-white shadow-sm transition-all ${onClick ? 'cursor-pointer hover:shadow-md active:scale-[0.98]' : ''} ${className}`}>{children}</div>;
const Label = ({children, className=""})=> <label className={`text-xs font-bold text-gray-500 uppercase mb-1 block ${className}`}>{children}</label>;
const Input = ({className="",...p})=> <input className={`w-full px-3 py-2 rounded-xl border bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all text-sm text-slate-900 ${className}`} {...p}/>;
const Button = ({children, className="", variant="primary", ...p})=> {
  const base = "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold transition-all active:scale-95 text-sm";
  let styles = variant === "primary" ? "bg-blue-600 text-white hover:bg-blue-700" : (variant === "secondary" ? "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50" : "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100");
  return <button className={`${base} ${styles} ${className}`} {...p}>{children}</button>;
};
const EstadoBadge = ({ estado }) => {
  const map = { VENCIDA:"bg-red-600 text-white", URGENTE:"bg-orange-500 text-white", PRONTO:"bg-yellow-400 text-black", OK:"bg-emerald-600 text-white", "FALTA INFORMACIÓN": "bg-slate-400 text-white" };
  return <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${map[estado] || "bg-gray-200 text-gray-600"}`}>{estado}</span>;
};

/* =================== TABLAS E INSUMOS =================== */
function InsumosTable({ title, value = [], onChange }){
  const add = () => onChange([...value, { tipo:"Filtro", nombre:"", cant:1, enBodega:false }]);
  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm text-slate-900">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-black text-xs uppercase tracking-wider">{title}</h4>
        <Button onClick={add} variant="secondary" className="h-7 text-[10px] px-2 shadow-sm">+ ITEM</Button>
      </div>
      <div className="space-y-2">
        {value.map((r, i) => {
          const unit = r.tipo === "Aceite" ? "L" : (r.tipo === "Filtro" ? "un" : "—");
          return (
            <div key={i} className="flex flex-wrap md:flex-nowrap gap-2 items-center border-b border-gray-50 pb-2 last:border-0">
              <select className="text-xs border rounded-lg p-1.5 bg-gray-50" value={r.tipo} onChange={e=>onChange(value.map((x,idx)=>idx===i?{...x, tipo:e.target.value}:x))}>
                <option>Filtro</option><option>Aceite</option><option>Otro</option>
              </select>
              <input className="text-xs border rounded-lg p-1.5 flex-1 min-w-[120px]" placeholder="Nombre..." value={r.nombre} onChange={e=>onChange(value.map((x,idx)=>idx===i?{...x, nombre:e.target.value}:x))} />
              <div className="flex items-center gap-1">
                <input type="number" className="text-xs border rounded-lg p-1.5 w-14 font-bold" value={r.cant} onChange={e=>onChange(value.map((x,idx)=>idx===i?{...x, cant:Number(e.target.value)}:x))} />
                <span className="text-[10px] font-bold text-gray-400 w-4">{unit}</span>
              </div>
              <label className="flex items-center gap-1 text-[10px] font-black text-gray-400 uppercase">
                <input type="checkbox" checked={r.enBodega} onChange={e=>onChange(value.map((x,idx)=>idx===i?{...x, enBodega:e.target.checked}:x))} /> BOD
              </label>
              <button onClick={()=>onChange(value.filter((_,idx)=>idx!==i))} className="text-red-400 hover:text-red-600 px-1 font-bold">✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DocumentManager({ equipoId, docs = [], onUpdate }){
  const [uploading, setUploading] = useState(false);
  const handleUpload = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    setUploading(true);
    try {
      const fileRef = ref(storage, `equipos/${equipoId}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      onUpdate([...docs, { name: file.name, url, path: fileRef.fullPath }]);
    } catch (err) { alert("Error: " + err.message); }
    setUploading(false);
  };
  return (
    <div className="bg-gray-50 rounded-2xl p-4 border border-dashed border-gray-300">
      <div className="flex justify-between items-center mb-3 text-slate-900">
        <h4 className="font-bold text-xs uppercase">Documentos</h4>
        <label className="cursor-pointer bg-blue-600 text-white px-3 py-1 rounded-lg text-[10px] font-black hover:bg-blue-700 uppercase transition-all shadow-md">
          {uploading ? "..." : "+ Subir"}
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {docs.map((d, i) => (
          <div key={i} className="flex items-center justify-between bg-white p-2 rounded-lg border text-[10px] text-slate-900">
            <a href={d.url} target="_blank" rel="noreferrer" className="text-blue-600 font-bold truncate flex-1 underline">📄 {d.name}</a>
            <button onClick={async () => { if(window.confirm("¿Eliminar?")){ await deleteObject(ref(storage, d.path)); onUpdate(docs.filter((_, idx)=>idx!==i)); } }} className="text-red-400 ml-2 font-bold">✕</button>
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
  const sinDocumentos = ["CARGADOR", "EXCAVADORA"].includes(e.categoria); // Punto 2
  
  const unit = esCamioneta ? "km" : "h";
  const labelMain = esCamioneta ? "Odómetro" : "Horómetro";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in duration-500">
      <div className="lg:col-span-3 space-y-6">
        <Card className="p-6">
          {/* Fila 1: ID */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div><Label>Marca</Label>
              <select className="w-full text-sm border rounded-xl p-2 bg-gray-50 font-bold text-slate-900" value={e.marca} onChange={v=>upd({marca:v.target.value, patente:""})}>
                <option value="">—</option>
                {(BRAND_OPTIONS[e.categoria]||[]).map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div><Label>Patente</Label>
              <select className="w-full text-sm border rounded-xl p-2 bg-gray-50 font-black text-blue-700 uppercase" value={e.patente} onChange={v=>upd({patente:v.target.value})}>
                <option value="">—</option>
                {platesFor(e.categoria, e.marca).map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            <div><Label>Operador</Label>
              <select className="w-full text-sm border rounded-xl p-2 bg-gray-50 font-bold text-slate-900" value={e.operador} onChange={v=>upd({operador:v.target.value})}>
                <option value="">—</option>
                {OPERATORS.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
          </div>

          {/* Fila 2 & 3: Métricas (Solo si no es Batea) - Punto 7 */}
          {!esBateaOCama && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-slate-900">
                <div><Label>{labelMain} Actual ({unit})</Label><Input type="number" value={e.horaActual} onChange={v=>upd({horaActual:Number(v.target.value)})}/></div>
                <div><Label>Fecha Lectura</Label><Input type="date" value={e.horaActualFecha} onChange={v=>upd({horaActualFecha:v.target.value})}/></div>
                <div><Label>Prev cada ({unit})</Label><Input type="number" placeholder={cat?.defaultPreventive} value={e.preventivaCada || ""} onChange={v=>upd({preventivaCada: Number(v.target.value)})}/></div>
                <div><Label>Gen cada ({unit})</Label><Input type="number" value={e.generalCada || 2000} onChange={v=>upd({generalCada:Number(v.target.value)})}/></div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 text-slate-900">
                <div><Label>{esCamioneta ? "Km Diarios" : "Horas Diarias"}</Label><Input type="number" placeholder="Proyectado" value={e.horasDiariasOverride || ""} onChange={v=>upd({horasDiariasOverride: Number(v.target.value)})}/></div>
                <div><Label>Última Prev ({unit})</Label><Input type="number" value={e.ultimaPreventivaHora || 0} onChange={v=>upd({ultimaPreventivaHora:Number(v.target.value)})}/></div>
                <div><Label>Última Gen ({unit})</Label><Input type="number" value={e.ultimaGeneralHora || 0} onChange={v=>upd({ultimaGeneralHora:Number(v.target.value)})}/></div>
                
                {!sinDocumentos ? ( // Punto 2
                  <>
                    <div><Label>Vence RT</Label><Input type="date" value={e.rtUltima || ""} onChange={v=>upd({rtUltima:v.target.value})}/></div>
                    <div><Label>Vence PC</Label><Input type="date" value={e.pcUltimo || ""} onChange={v=>upd({pcUltimo:v.target.value})}/></div>
                  </>
                ) : <div className="md:col-span-2"></div>}
              </div>
            </>
          )}

          {/* Registro Dual Camiones - Punto 5 */}
          {esCamion && (
            <div className="mb-6 p-4 bg-blue-50 rounded-2xl border border-blue-100">
               <h4 className="text-[10px] font-black text-blue-800 uppercase mb-3 italic">Registro Dual: Odómetro (km)</h4>
               <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-blue-700">Odómetro Actual</Label><Input type="number" value={e.odometro || ""} onChange={v=>upd({odometro: Number(v.target.value)})}/></div>
                  <div><Label className="text-blue-700">Fecha Odómetro</Label><Input type="date" value={e.odometroFecha || ""} onChange={v=>upd({odometroFecha: v.target.value})}/></div>
               </div>
            </div>
          )}

          {/* Bateas RT/PC Simplificado - Punto 7 */}
          {esBateaOCama && (
            <div className="grid grid-cols-2 gap-4 mb-6 text-slate-900">
              <div><Label>Vence Revisión Técnica</Label><Input type="date" value={e.rtUltima || ""} onChange={v=>upd({rtUltima:v.target.value})}/></div>
              <div><Label>Vence Permiso de Circulación</Label><Input type="date" value={e.pcUltimo || ""} onChange={v=>upd({pcUltimo:v.target.value})}/></div>
            </div>
          )}

          {/* Fila 4: Notas - Siempre Visible */}
          <div className="mb-6 text-slate-900">
            <Label>Notas y Observaciones</Label>
            <textarea className="w-full px-3 py-2 rounded-xl border bg-gray-50 focus:bg-white text-sm h-16" value={e.notas || ""} onChange={v=>upd({notas:v.target.value})} placeholder="Detalles de fallas, reparaciones..."/>
          </div>

          {/* Fila 5 & 6: Insumos (Ocultos para Bateas) */}
          {!esBateaOCama && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <InsumosTable title="Insumos Preventiva" value={e.insumosPrev} onChange={v=>upd({insumosPrev:v})}/>
              <InsumosTable title="Insumos General" value={e.insumosGen} onChange={v=>upd({insumosGen:v})}/>
            </div>
          )}

          {/* AdBlue VW */}
          {(e.categoria === "CAMION" && e.marca === "Volkswagen") && (
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-emerald-900">
              <h4 className="text-xs font-black uppercase mb-3">Registro AdBlue (Exclusivo VW)</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><Label className="text-emerald-700">Carga (L)</Label><Input type="number" value={e.adblueLitros || ""} onChange={v=>upd({adblueLitros: Number(v.target.value)})}/></div>
                <div><Label className="text-emerald-700">Fecha Carga</Label><Input type="date" value={e.adblueFecha || ""} onChange={v=>upd({adblueFecha: v.target.value})}/></div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* PANEL LATERAL LEIBLE */}
      <div className="space-y-4">
        {!esBateaOCama ? (
          <Card className="p-6 bg-white border-2 border-slate-100 shadow-xl text-slate-900">
            <h4 className="text-[10px] font-black uppercase tracking-widest mb-6 text-slate-400 italic text-center">Control de Ciclos</h4>
            <div className="space-y-8">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-tighter">Próx. Preventiva</span>
                  <EstadoBadge estado={s.salud} />
                </div>
                <p className="text-3xl font-black italic tracking-tighter text-slate-900 leading-none">
                  {s.salud === "FALTA INFORMACIÓN" ? "—" : `${fmt(s.proxPrev)} ${unit}`}
                </p>
                {s.salud !== "FALTA INFORMACIÓN" && <p className="text-[11px] font-bold text-blue-600 mt-1 uppercase text-left">Faltan: {fmt(s.restPrev)} {unit}</p>}
                <button onClick={()=>{if(window.confirm(`¿Registrar realización?`)) upd({ultimaPreventivaHora: s.horaActual})}} className="w-full mt-4 bg-white text-slate-900 py-3 rounded-xl font-black text-xs uppercase tracking-tighter hover:bg-emerald-50 shadow-md border border-slate-100 transition-all">Registrar Prev.</button>
              </div>
              <div className="border-t border-slate-100 pt-6">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-tighter">Próx. General</span>
                  <EstadoBadge estado={s.salud === "FALTA INFORMACIÓN" ? "FALTA INFORMACIÓN" : s.estGen} />
                </div>
                <p className="text-3xl font-black italic tracking-tighter text-slate-900 leading-none">
                  {s.salud === "FALTA INFORMACIÓN" ? "—" : `${fmt(s.proxGen)} ${unit}`}
                </p>
                <button onClick={()=>{if(window.confirm(`¿Registrar realización?`)) upd({ultimaGeneralHora: s.horaActual})}} className="w-full mt-4 bg-white text-slate-900 py-3 rounded-xl font-black text-xs uppercase tracking-tighter hover:bg-blue-50 shadow-md border border-slate-100 transition-all">Registrar Gen.</button>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6 bg-slate-900 text-white shadow-xl">
             <h4 className="text-[10px] font-black uppercase text-slate-400 mb-6 tracking-widest text-center">Estatus Legal</h4>
             <div className="space-y-6">
                <div>
                  <Label className="text-slate-400">R. Técnica</Label>
                  <EstadoBadge estado={estadoPorDias(daysBetween(todayISO(), addYears(e.rtUltima || todayISO(), 1)), 30)} />
                </div>
                <div>
                  <Label className="text-slate-400">P. Circulación</Label>
                  <EstadoBadge estado={estadoPorDias(daysBetween(todayISO(), addYears(e.pcUltimo || todayISO(), 1)), 30)} />
                </div>
             </div>
          </Card>
        )}
        <DocumentManager equipoId={e.id} docs={e.documentos || []} onUpdate={v => upd({documentos: v})} />
        <Button variant="danger" className="w-full py-3 uppercase tracking-tighter font-black opacity-60 hover:opacity-100 transition-all shadow-sm" onClick={()=>removeEquipo(e.id)}>Dar de Baja</Button>
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
    const esBatea = ["BATEA", "CAMA_BAJA"].includes(e.categoria);
    if (esBatea) return { salud: "OK" };

    const cat = CATEGORIES.find(c=>c.id===e.categoria);
    const prevCada = Number(e.preventivaCada ?? cat?.defaultPreventive ?? 250);
    const genCada = Number(e.generalCada || 2000);
    
    // REGLA 3: Si falta información crítica (Punto 3)
    if (!e.horaActual || !e.horaActualFecha || e.ultimaPreventivaHora === undefined || e.horaActual === 0) {
      return { salud: "FALTA INFORMACIÓN", proxPrev: 0, proxGen: 0, restPrev: 0, restGen: 0, estPrev: "FALTA INFORMACIÓN", estGen: "FALTA INFORMACIÓN" };
    }

    const elapsed = e.horaActualFecha ? (e.horasDiariasOverride > 0 ? daysBetween(e.horaActualFecha, todayISO()) * e.horasDiariasOverride : workingHoursBetween(e.horaActualFecha, todayISO())) : 0;
    const horaActual = Number(e.horaActual||0) + Math.max(0, elapsed);
    const proxPrev = (Number(e.ultimaPreventivaHora||0) + prevCada);
    const proxGen = (Number(e.ultimaGeneralHora||0) + genCada);
    const restPrev = proxPrev - horaActual;
    const restGen = proxGen - horaActual;
    
    // REGLA 1: Pronto empieza desde 120h (Punto 1 y 4)
    const thresholdPronto = esCamioneta ? 1000 : 120;
    const thresholdUrgente = esCamioneta ? 500 : 40;

    const getEst = (r) => {
      if (r <= 0) return "VENCIDA";
      if (r <= thresholdUrgente) return "URGENTE";
      if (r <= thresholdPronto) return "PRONTO";
      return "OK";
    };

    const estPrev = getEst(restPrev);
    const estGen = getEst(restGen);
    const priority = { "FALTA INFORMACIÓN": 5, VENCIDA: 4, URGENTE: 3, PRONTO: 2, OK: 1 };
    const worst = priority[estPrev] > priority[estGen] ? estPrev : estGen;

    return { horaActual, proxPrev, proxGen, restPrev, restGen, estPrev, estGen, salud: worst };
  }, []);

  if (!view.cat) {
    return (
      <div className="p-6 max-w-6xl mx-auto min-h-screen bg-slate-50 font-sans text-slate-900">
        <header className="mb-10 flex justify-between items-end border-b pb-6 border-slate-200">
          <div><h1 className="text-5xl font-black tracking-tighter uppercase italic text-slate-900 leading-none">VIA 5</h1><p className="font-bold text-blue-600 uppercase text-[10px] tracking-widest text-left">GESTIÓN EFESA</p></div>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {CATEGORIES.map(c => {
            const unidades = equipos.filter(e => e.categoria === c.id);
            const critico = unidades.some(e => ["VENCIDA","URGENTE"].includes(calcularEstado(e).salud));
            const falta = unidades.some(e => calcularEstado(e).salud === "FALTA INFORMACIÓN");
            return (
              <Card key={c.id} onClick={() => setView({ cat: c.id, id: null })} className="p-8 group hover:border-blue-500 shadow-sm transition-all duration-300">
                <div className="flex justify-between items-start mb-6">
                  <span className="text-7xl group-hover:scale-110 transition-transform duration-300">{c.icon}</span>
                  {unidades.length > 0 && (
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black ${critico ? 'bg-red-600 text-white animate-pulse' : (falta ? 'bg-slate-400 text-white' : 'bg-slate-900 text-white')}`}>
                      {unidades.length} UNIDS
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-black text-slate-800 uppercase italic leading-none text-left">{c.label}</h3>
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
      <div className="p-6 max-w-6xl mx-auto min-h-screen">
        <div className="flex items-center gap-4 mb-10 text-slate-900 text-left">
          <Button variant="secondary" onClick={() => setView({ cat: null, id: null })} className="rounded-full w-12 h-12 p-0 text-xl font-black shadow-md">←</Button>
          <h2 className="text-4xl font-black uppercase italic tracking-tighter">{cat.icon} {cat.label}</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {equipos.filter(e => e.categoria === view.cat).map(e => (
            <Card key={e.id} onClick={() => setView({ ...view, id: e.id })} className="p-6 border-l-[16px] border-l-blue-600 shadow-md">
              <div className="font-black text-2xl mb-1 text-slate-800 tracking-tighter uppercase text-left">{e.patente || "S/P"}</div>
              <div className="text-[10px] font-bold text-slate-400 mb-6 uppercase tracking-widest text-left">{e.marca || "No definida"}</div>
              <div className="text-left"><EstadoBadge estado={calcularEstado(e).salud} /></div>
            </Card>
          ))}
          <button onClick={() => {
            const base = { categoria: view.cat, marca:"", patente:"", horaActual:0, horaActualFecha: todayISO(), ultimaPreventivaHora:0, ultimaGeneralHora:0, insumosPrev: [], insumosGen: [], documentos: [], notas: "", updatedAt: serverTimestamp() };
            addDoc(collection(db,"equipos"), base).then(d => setView({...view, id: d.id}));
          }} className="border-4 border-dashed rounded-3xl p-6 flex flex-col items-center justify-center text-slate-300 hover:text-blue-600 hover:border-blue-600 transition-all font-black uppercase text-xl">+ NUEVO</button>
        </div>
      </div>
    );
  }

  const equipoActual = equipos.find(x => x.id === view.id);
  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen bg-slate-50">
      <div className="mb-8 flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <Button variant="secondary" onClick={() => setView({ ...view, id: null })} className="uppercase italic tracking-tighter font-black shadow-sm transition-all text-slate-900">← Listado</Button>
        <div className="text-right">
          <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Ficha de Equipo EFESA</p>
          <h2 className="text-3xl font-black text-slate-900 italic uppercase tracking-tighter">{equipoActual?.patente || "NUEVO"}</h2>
        </div>
      </div>
      {equipoActual && <RowEditor e={equipoActual} calcularEstado={calcularEstado} updateEquipo={(id, p) => updateDoc(doc(db, "equipos", id), { ...p, updatedAt: serverTimestamp() })} removeEquipo={(id) => { if(window.confirm("¿Eliminar?")) { deleteDoc(doc(db,"equipos",id)); setView({...view, id: null}); } }} />}
    </div>
  );
}

// Función auxiliar para RT/PC en Bateas
function estadoPorDias(dias, horizonte){
  if(dias<=0) return "VENCIDA"; if(dias<=7) return "URGENTE"; if(dias<=horizonte) return "PRONTO"; return "OK";
}