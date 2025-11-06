// src/App.jsx
import React, { useMemo, useState, useEffect, useCallback, memo } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getFirestore, collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, serverTimestamp
} from "firebase/firestore";

/* ======================= Firebase (tu config real) ======================= */
const firebaseConfig = {
  apiKey: "AIzaSyAwBnvWXLKO7ctOwmHYf4SO2CACz1D6ADI",
  authDomain: "mantenciones-v-5.firebaseapp.com",
  projectId: "mantenciones-v-5",
  storageBucket: "mantenciones-v-5.firebasestorage.app",
  messagingSenderId: "294743111767",
  appId: "1:294743111767:web:27f28d9e227648438d3e02",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
async function ensureAnonAuth(){ if(!auth.currentUser) await signInAnonymously(auth); return auth.currentUser; }

/* =================== Catálogo / reglas =================== */
const CATEGORIES = [
  { id: "CARGADOR",   label: "Cargador Frontal", defaultPreventive: 200 },
  { id: "CAMION",     label: "Camión",           defaultPreventive: 300 }, // (antes Camión Tolva)
  { id: "CAMIONETA",  label: "Camioneta",        defaultPreventive: 300 },
  { id: "EXCAVADORA", label: "Excavadora",       defaultPreventive: 250 },
  { id: "GENERADOR",  label: "Generador",        defaultPreventive: 250 },
  { id: "BATEA",      label: "Batea",            defaultPreventive: 300 },
  { id: "CAMA_BAJA",  label: "Cama Baja",        defaultPreventive: 300 },
];
const CATS_CON_PERMISOS = new Set(["CAMION","BATEA","CAMA_BAJA"]);

/* ===== Marcas y Patentes dependientes ===== */
const BRAND_OPTIONS = {
  CAMION:     ["Mack", "Volkswagen", "Renault"],     // + Renault
  CARGADOR:   ["Komatsu", "Hyundai"],
  EXCAVADORA: ["Develon", "Hyundai"],
  GENERADOR:  ["BSG"],
  CAMIONETA:  ["Maxus", "Peugeot"],                  // nueva categoría
  BATEA:      ["Randon"],                             // marca fija
  CAMA_BAJA:  ["Schilger"],                           // marca fija
};

function platesFor(categoria, marca){
  // Camión
  if (marca === "Mack")       return ["DFLW-71", "DRHK-42", "DRXR-54", "WY-8717"];
  if (marca === "Volkswagen") return ["RHGC-83", "RKSC-25"];
  if (marca === "Renault")    return ["SW-6114"];

  // Cargador / Excavadora (Hyundai depende de categoría)
  if (marca === "Komatsu")    return ["SDTP-59"];
  if (marca === "Hyundai") {
    if (categoria === "CARGADOR")   return ["LXDT-19"];
    if (categoria === "EXCAVADORA") return ["LVGS-87", "HDWS-49"];
    return [];
  }
  if (marca === "Develon")    return ["TCCW-19"];

  // Generador
  if (marca === "BSG")        return [];

  // Camioneta
  if (marca === "Maxus")      return ["RHRB-94"];
  if (marca === "Peugeot")    return ["TTVR-19"];

  // Batea / Cama Baja
  if (marca === "Randon")     return ["JL-8263"];
  if (marca === "Schilger")   return ["JH-4921"];

  return [];
}

// Operadores fijos
const OPERATORS = [
  "Eligio Miranda",
  "Patricio Obando",
  "Salomón Fernández",
  "Segundo Gómez",
  "Fernando Gueicha",
  "Francisco Bahamonde",
  "Pedro Espinoza",
  "Cecilia Sandoval",
  "Ignacio Echeverría", 
];

/* ======================== Utilidades ======================== */
function fmt(n,dec=0){ if(n===null||n===undefined||Number.isNaN(+n)) return "—"; return Number(n).toLocaleString("es-CL",{minimumFractionDigits:dec,maximumFractionDigits:dec}); }
const todayISO = ()=>{ const d=new Date(); const p=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };
function parseISO(d){ if(!d) return null; const [y,m,da]=String(d).split("-").map(Number); if(!y||!m||!da) return null; const dt=new Date(y,m-1,da); return Number.isNaN(dt.getTime())?null:dt; }
function addYears(iso, years=1){ const d=parseISO(iso); if(!d) return null; d.setFullYear(d.getFullYear()+years); return d.toISOString().slice(0,10); }
function daysBetween(a,b){ const A=parseISO(a); const B=parseISO(b||todayISO()); if(!A||!B) return 0; const ms=B.setHours(0,0,0,0)-A.setHours(0,0,0,0); return Math.round(ms/86400000); }

// Jornada laboral corporativa (L-J 9h; V 8h; S-D 0h)
const WORK_SCHEDULE = {
  1:[{start:"08:00",end:"13:00"},{start:"14:00",end:"18:00"}],
  2:[{start:"08:00",end:"13:00"},{start:"14:00",end:"18:00"}],
  3:[{start:"08:00",end:"13:00"},{start:"14:00",end:"18:00"}],
  4:[{start:"08:00",end:"13:00"},{start:"14:00",end:"18:00"}],
  5:[{start:"08:00",end:"13:00"},{start:"14:00",end:"17:00"}],
  6:[],0:[]
};
function timeStrToMinutes(t){ const [h,m]=t.split(":").map(Number); return h*60+m; }
function dayScheduleHours(dow){ const a=WORK_SCHEDULE[dow]||[]; return a.reduce((s,b)=>s+(timeStrToMinutes(b.end)-timeStrToMinutes(b.start)),0)/60; }
function workingHoursBetween(a,b){ const A=parseISO(a); const B=parseISO(b||todayISO()); if(!A||!B) return 0; let tot=0; const cur=new Date(A.getTime()); while(cur<=B){ tot+=dayScheduleHours(cur.getDay()); cur.setDate(cur.getDate()+1); } return tot; }
function addBusinessHoursFromToday(hours){
  let remaining=Number(hours||0); if(!Number.isFinite(remaining)) return {days:0,date:todayISO()};
  const d=new Date(); let businessDays=0;
  while(remaining>0){ const h=dayScheduleHours(d.getDay()); if(h>0){ remaining-=h; businessDays+=1; } d.setDate(d.getDate()+1); }
  if(businessDays>0) d.setDate(d.getDate()-1);
  return { days: businessDays, date: d.toISOString().slice(0,10) };
}
function estadoPorDias(dias, horizonte){
  if(dias<=0) return "VENCIDA";
  if(dias<=7) return "URGENTE";
  if(dias<=horizonte) return "PRONTO";
  return "OK";
}

/* ====================== Mini UI (sin shadcn) ====================== */
const Card = ({children,className=""})=> <div className={`rounded-2xl border bg-white ${className}`}>{children}</div>;
const CardHeader = ({children,className=""})=> <div className={`p-4 border-b ${className}`}>{children}</div>;
const CardTitle = ({children,className=""})=> <div className={`text-lg font-semibold ${className}`}>{children}</div>;
const CardContent = ({children,className=""})=> <div className={`p-4 ${className}`}>{children}</div>;
const Button = ({children,className="",...p})=> <button className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-gray-50 ${className}`} {...p}>{children}</button>;
const Input = ({className="",...p})=> <input className={`w-full px-3 py-2 rounded-lg border focus:outline-none ${className}`} {...p}/>;
const Label = ({children})=> <label className="text-sm font-medium">{children}</label>;
const Badge = ({children,className=""})=> <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${className}`}>{children}</span>;
const Progress = ({value=0})=> (
  <div className="h-2 w-full rounded-full bg-gray-200">
    <div className="h-2 rounded-full bg-emerald-600" style={{width:`${Math.max(0,Math.min(100,value))}%`}}/>
  </div>
);

/* ====================== Badges de estado ====================== */
const EstadoBadge = memo(function EstadoBadge({ estado, children }){
  const map = { VENCIDA:"bg-red-600 text-white", URGENTE:"bg-orange-500 text-white", PRONTO:"bg-yellow-400 text-black", OK:"bg-emerald-600 text-white", NA:"bg-gray-300 text-gray-700" };
  const cls = map[estado] || map.OK;
  return <Badge className={`${cls}`}>{children ?? estado}</Badge>;
});

/* =========================== App =========================== */
export default function AppMantenciones(){
  const [equipos, setEquipos] = useState([]);
  const [filtro, setFiltro] = useState("TODOS");
  const [queryText, setQueryText] = useState("");
  const [horizonte, setHorizonte] = useState(30);
  const [activeTab, setActiveTab] = useState("todos"); // "todos" | id equipo

  // Auth + snapshot
  useEffect(()=>{
    let unsub=null;
    ensureAnonAuth()
      .then(()=>{
        unsub = onSnapshot(collection(db,"equipos"), snap=>{
          const arr = snap.docs.map(d=>({ id:d.id, ...d.data() }));
          setEquipos(arr);
          if(activeTab!=="todos" && !arr.find(x=>x.id===activeTab)) setActiveTab("todos");
        });
      })
      .catch(err=>alert("Auth anónima falló: "+(err?.message||String(err))));
    return ()=>{ if(unsub) unsub(); };
  },[]);

  const addEquipo = useCallback(async (prefill={})=>{
    const base = {
      categoria:"CARGADOR", marca:"", patente:"", operador:"",
      descripcion:"Mantención preventiva (filtros y aceites)",
      horasDiariasOverride:null, horaActual:0, horaActualFecha: todayISO(),
      preventivaCada:null, generalCada:2000, ultimaPreventivaHora:0, ultimaGeneralHora:0,
      rtUltima:null, pcUltimo:null,
      insumosPrev: [],  // ← Preventiva
      insumosGen:  [],  // ← General (NUEVO)
      notas:"", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    };
    await addDoc(collection(db,"equipos"), { ...base, ...prefill, updatedAt: serverTimestamp() });
  },[]);
  const updateEquipo = useCallback(async(id,patch)=>{ await updateDoc(doc(db,"equipos",id), { ...patch, updatedAt: serverTimestamp() }); },[]);
  const removeEquipo = useCallback(async(id)=>{ await deleteDoc(doc(db,"equipos",id)); },[]);

  // Cálculo de estados (Prev, Gen, RT, PC)
  const calcularEstado = useCallback((e)=>{
    const cat = CATEGORIES.find(c=>c.id===e.categoria);
    const preventivaCada = Number(e.preventivaCada ?? cat?.defaultPreventive ?? 250) || 250;
    const generalCada = Number(e.generalCada || 2000);

    const horaMedida = Number(e.horaActual||0);
    const override = Number(e.horasDiariasOverride||0);
    const elapsed = e.horaActualFecha
      ? (override>0 ? daysBetween(e.horaActualFecha, todayISO())*override : workingHoursBetween(e.horaActualFecha, todayISO()))
      : 0;
    const horaActual = horaMedida + Math.max(0,elapsed);

    const proxPrev = Number(e.ultimaPreventivaHora||0) + preventivaCada;
    const proxGen  = Number(e.ultimaGeneralHora||0)    + generalCada;

    const restPrev = proxPrev - horaActual;
    const restGen  = proxGen  - horaActual;

    const avancePrev = Math.min(100, Math.max(0, ((horaActual-(e.ultimaPreventivaHora||0))/preventivaCada)*100));
    const avanceGen  = Math.min(100, Math.max(0, ((horaActual-(e.ultimaGeneralHora||0))/generalCada)*100));

    // ETA
    let diasPrev, diasGen, fechaPrev, fechaGen;
    if(override>0){
      diasPrev = restPrev/override; diasGen = restGen/override;
      const f = d=>{ if(d===null||Number.isNaN(d)) return null; const dd=new Date(); dd.setDate(dd.getDate()+Math.ceil(d)); return dd.toISOString().slice(0,10); };
      fechaPrev=f(diasPrev); fechaGen=f(diasGen);
    }else{
      const a=addBusinessHoursFromToday(restPrev); const b=addBusinessHoursFromToday(restGen);
      diasPrev=a.days; fechaPrev=a.date; diasGen=b.days; fechaGen=b.date;
    }

    const aplicaPermisos = CATS_CON_PERMISOS.has(e.categoria);
    let diasRT=null, diasPC=null, fechaRT=null, fechaPC=null;
    if(aplicaPermisos){
      const proxRT = e.rtUltima ? addYears(e.rtUltima,1) : null;
      const proxPC = e.pcUltimo ? addYears(e.pcUltimo,1) : null;
      if(proxRT){ diasRT = daysBetween(todayISO(), proxRT); fechaRT = proxRT; }
      if(proxPC){ diasPC = daysBetween(todayISO(), proxPC); fechaPC = proxPC; }
    }

    const estPrev = estadoPorDias(Math.ceil(diasPrev ?? Infinity), horizonte);
    const estGen  = estadoPorDias(Math.ceil(diasGen  ?? Infinity), horizonte);
    const estRT   = aplicaPermisos ? estadoPorDias(Math.ceil(diasRT ?? Infinity), horizonte) : "NA";
    const estPC   = aplicaPermisos ? estadoPorDias(Math.ceil(diasPC ?? Infinity), horizonte) : "NA";

    return {
      horaActual,
      preventivaCada, generalCada, proxPrev, proxGen, restPrev, restGen, avancePrev, avanceGen,
      diasPrev, diasGen, fechaPrev, fechaGen,
      aplicaPermisos, diasRT, diasPC, fechaRT, fechaPC,
      estPrev, estGen, estRT, estPC
    };
  },[horizonte]);

  // Filtro listado “Todos”
  const equiposFiltrados = useMemo(()=>{
    return equipos.filter(e=>{
      const q=queryText.trim().toLowerCase();
      const matchQ=!q || [e.marca,e.patente,e.operador,e.descripcion].some(x=>String(x||"").toLowerCase().includes(q));
      const s=calcularEstado(e);
      const matchEstado = ["OK","PRONTO","URGENTE","VENCIDA"].includes(filtro)
        ? [s.estPrev,s.estGen,s.estRT,s.estPC].includes(filtro)
        : true;
      return matchQ && matchEstado;
    });
  },[equipos, filtro, queryText, calcularEstado]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Mantenciones · VIA5</h1>
        <div className="flex items-center gap-2">
          <Button onClick={()=>addEquipo({})}>➕ Equipo</Button>
          <span className="text-sm text-gray-500">Sincronizado con Firestore</span>
        </div>
      </div>

      {/* ======= Tabs simples ======= */}
      <div className="flex gap-2 mb-3 overflow-x-auto">
        <Button className={`${activeTab==='todos'?'bg-gray-100':''}`} onClick={()=>setActiveTab('todos')}>Todos</Button>
        {equipos.map(e=>{
          const label = e.patente?.trim() ? e.patente.trim() : (CATEGORIES.find(c=>c.id===e.categoria)?.label || e.categoria);
          return <Button key={e.id} className={`${activeTab===e.id?'bg-gray-100':''}`} onClick={()=>setActiveTab(e.id)}>{label}</Button>;
        })}
      </div>

      {/* ======= Contenido según tab ======= */}
      {activeTab==="todos" ? (
        <>
          <Card>
            <CardHeader><CardTitle>Resumen y filtros</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-4">
                  <Label>Buscar</Label>
                  <Input value={queryText} onChange={e=>setQueryText(e.target.value)} placeholder="Marca, patente, operador…" />
                </div>
                <div className="md:col-span-4">
                  <Label>Estado</Label>
                  <select className="w-full px-3 py-2 rounded-lg border" value={filtro} onChange={e=>setFiltro(e.target.value)}>
                    {["TODOS","OK","PRONTO","URGENTE","VENCIDA"].map(x=><option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div className="md:col-span-4">
                  <Label>Alerta (días)</Label>
                  <Input type="number" value={horizonte} onChange={e=>setHorizonte(Number(e.target.value))}/>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mt-4 grid grid-cols-1 gap-3">
            {equiposFiltrados.length===0 && <div className="text-gray-500 p-4 border rounded-xl">No hay equipos.</div>}
            {equiposFiltrados.map(e=><RowEditor key={e.id} e={e} calcularEstado={calcularEstado} updateEquipo={updateEquipo} removeEquipo={removeEquipo}/>)}
          </div>
        </>
      ) : (
        equipos.filter(x=>x.id===activeTab).map(e=>(
          <RowEditor key={e.id} e={e} calcularEstado={calcularEstado} updateEquipo={updateEquipo} removeEquipo={removeEquipo}/>
        ))
      )}
    </div>
  );
}

/* =================== Tabla de Insumos (reutilizable) =================== */
function InsumosTable({ title, value=[], onChange }){
  const rows = value;

  const setRow = (i, patch) => { onChange(rows.map((r,idx)=> idx===i ? { ...r, ...patch } : r)); };
  const removeRow = (i) => { onChange(rows.filter((_,idx)=> idx!==i)); };
  const addRow = () => { onChange([...rows, { tipo:"Filtro", nombre:"", unidad:"un", cant:1, enBodega:false }]); };

  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">{title}</div>
        <Button onClick={addRow}>Agregar</Button>
      </div>

      <div className="space-y-2">
        {rows.length===0 && <div className="text-sm text-gray-500">Sin insumos</div>}
        {rows.map((r,i)=>{
          const unidadAuto = r.tipo==="Aceite" ? "L" : (r.tipo==="Filtro" ? "un" : r.unidad || "un");
          const isAuto = r.tipo==="Aceite" || r.tipo==="Filtro";

          return (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-12 md:col-span-2">
                <Label>Tipo</Label>
                <select
                  className="w-full px-3 py-2 rounded-lg border"
                  value={r.tipo}
                  onChange={e=>{
                    const tipo = e.target.value;
                    const unidad = tipo==="Aceite" ? "L" : (tipo==="Filtro" ? "un" : (r.unidad||"un"));
                    setRow(i,{ tipo, unidad });
                  }}
                >
                  {["Aceite","Filtro","Otro"].map(t=> <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="col-span-12 md:col-span-4">
                <Label>Nombre</Label>
                <Input value={r.nombre} onChange={e=>setRow(i,{nombre:e.target.value})} placeholder="Aire primario..., Aceite 15W-40..., etc."/>
              </div>

              <div className="col-span-4 md:col-span-2">
                <Label>Unidad</Label>
                {isAuto ? (
                  <Input value={unidadAuto} readOnly className="bg-gray-50"/>
                ) : (
                  <select
                    className="w-full px-3 py-2 rounded-lg border"
                    value={unidadAuto}
                    onChange={e=>setRow(i,{unidad:e.target.value})}
                  >
                    <option value="L">L</option>
                    <option value="un">un</option>
                  </select>
                )}
              </div>

              <div className="col-span-4 md:col-span-2">
                <Label>Cant.</Label>
                <Input type="number" min={0} value={r.cant ?? 0} onChange={e=>setRow(i,{cant:Number(e.target.value)})}/>
              </div>

              <div className="col-span-3 md:col-span-1">
                <Label>&nbsp;</Label>
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={!!r.enBodega}
                    onChange={e=>setRow(i,{enBodega:e.target.checked})}
                  />
                  <span>En bodega</span>
                </label>
              </div>

              <div className="col-span-1 text-right">
                <Label>&nbsp;</Label>
                <Button onClick={()=>removeRow(i)}>X</Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =================== Row / Editor por equipo =================== */
const RowEditor = memo(function RowEditor({ e, calcularEstado, updateEquipo, removeEquipo }){
  const s = calcularEstado(e);
  const cat = CATEGORIES.find(c=>c.id===e.categoria);
  const upd = (patch)=>updateEquipo(e.id, patch);

  // listas dependientes
  const brandOpts = BRAND_OPTIONS[e.categoria] || [];
  const plateOpts = platesFor(e.categoria, e.marca);

  useEffect(()=>{ if (e.marca && !brandOpts.includes(e.marca)) { upd({ marca:"", patente:"" }); } }, [e.categoria]); // eslint-disable-line
  useEffect(()=>{ if (e.patente && plateOpts.length>0 && !plateOpts.includes(e.patente)) { upd({ patente:"" }); } }, [e.marca, e.categoria]); // eslint-disable-line

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <span>🔧</span>
            {cat?.label || e.categoria} · {e.marca || "—"} · {e.patente || "—"}
          </CardTitle>

          <div className="flex flex-wrap gap-2">
            <EstadoBadge estado={s.estPrev}>Prev: {s.estPrev}</EstadoBadge>
            <EstadoBadge estado={s.estGen}>Gen: {s.estGen}</EstadoBadge>
            <EstadoBadge estado={s.estRT}>{s.aplicaPermisos ? `RT: ${s.estRT}` : "RT: N/A"}</EstadoBadge>
            <EstadoBadge estado={s.estPC}>{s.aplicaPermisos ? `PC: ${s.estPC}` : "PC: N/A"}</EstadoBadge>
            <Button onClick={()=>removeEquipo(e.id)}>Eliminar</Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Datos base */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-3">
            <Label>Categoría</Label>
            <select className="w-full px-3 py-2 rounded-lg border" value={e.categoria||"CARGADOR"} onChange={ev=>upd({categoria:ev.target.value})}>
              {CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          {/* Marca dependiente */}
          <div className="md:col-span-3">
            <Label>Marca</Label>
            <select className="w-full px-3 py-2 rounded-lg border" value={e.marca||""} onChange={ev=>upd({marca:ev.target.value, patente:""})}>
              <option value="">—</option>
              {brandOpts.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Patente dependiente */}
          <div className="md:col-span-3">
            <Label>Patente</Label>
            {plateOpts.length>0 ? (
              <select className="w-full px-3 py-2 rounded-lg border" value={e.patente||""} onChange={ev=>upd({patente:ev.target.value})}>
                <option value="">—</option>
                {plateOpts.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <Input value={e.patente||""} onChange={ev=>upd({patente:ev.target.value})} placeholder="(opcional / sin placa)"/>
            )}
          </div>

          {/* Operador fijo */}
          <div className="md:col-span-3">
            <Label>Operador</Label>
            <select className="w-full px-3 py-2 rounded-lg border" value={e.operador||""} onChange={ev=>upd({operador:ev.target.value})}>
              <option value="">—</option>
              {OPERATORS.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="md:col-span-3"><Label>Horas diarias (override)</Label><Input type="number" value={e.horasDiariasOverride ?? ""} onChange={ev=>upd({horasDiariasOverride: ev.target.value===""? null : Number(ev.target.value)})}/></div>
          <div className="md:col-span-3"><Label>Horómetro actual</Label><Input type="number" value={e.horaActual||0} onChange={ev=>upd({horaActual:Number(ev.target.value)})}/></div>
          <div className="md:col-span-3"><Label>Fecha horómetro</Label><Input type="date" value={e.horaActualFecha||""} onChange={ev=>upd({horaActualFecha:ev.target.value})}/></div>

          <div className="md:col-span-3"><Label>Preventiva cada (h)</Label><Input type="number" value={e.preventivaCada ?? ""} placeholder={`Por defecto: ${cat?.defaultPreventive ?? 250}`} onChange={ev=>upd({preventivaCada: ev.target.value===""? null : Number(ev.target.value)})}/></div>
          <div className="md:col-span-3"><Label>General cada (h)</Label><Input type="number" value={e.generalCada ?? 2000} onChange={ev=>upd({generalCada:Number(ev.target.value)})}/></div>
          <div className="md:col-span-3"><Label>Última PREV (h)</Label><Input type="number" value={e.ultimaPreventivaHora||0} onChange={ev=>upd({ultimaPreventivaHora:Number(ev.target.value)})}/></div>
          <div className="md:col-span-3"><Label>Última GEN (h)</Label><Input type="number" value={e.ultimaGeneralHora||0} onChange={ev=>upd({ultimaGeneralHora:Number(ev.target.value)})}/></div>

          {CATS_CON_PERMISOS.has(e.categoria) && (
            <>
              <div className="md:col-span-3"><Label>Última Revisión Técnica</Label><Input type="date" value={e.rtUltima||""} onChange={ev=>upd({rtUltima: ev.target.value || null})}/></div>
              <div className="md:col-span-3"><Label>Último Permiso de Circulación</Label><Input type="date" value={e.pcUltimo||""} onChange={ev=>upd({pcUltimo: ev.target.value || null})}/></div>
            </>
          )}

          <div className="md:col-span-12"><Label>Descripción</Label><Input value={e.descripcion||""} onChange={ev=>upd({descripcion:ev.target.value})}/></div>
          <div className="md:col-span-12"><Label>Notas</Label><Input value={e.notas||""} onChange={ev=>upd({notas:ev.target.value})}/></div>
        </div>

        {/* Insumos PREVENTIVA y GENERAL */}
        <InsumosTable
          title="Insumos PREVENTIVA"
          value={Array.isArray(e.insumosPrev) ? e.insumosPrev : []}
          onChange={(next)=>upd({ insumosPrev: next })}
        />
        <InsumosTable
          title="Insumos GENERAL"
          value={Array.isArray(e.insumosGen) ? e.insumosGen : []}
          onChange={(next)=>upd({ insumosGen: next })}
        />

        {/* Paneles (progress + texto grande) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 rounded-2xl border bg-gray-50">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">Preventiva</span>
              <span className="text-base font-semibold">{fmt(s.avancePrev,0)}%</span>
            </div>
            <Progress value={Math.max(0,Math.min(100,s.avancePrev||0))}/>
            <div className="mt-2 text-base leading-snug">
              Próxima a <b>{fmt(s.proxPrev)}</b> h · Restan <b>{fmt(s.restPrev)}</b> h · {s.diasPrev!==null ? <>≈ <b>{fmt(Math.ceil(s.diasPrev))}</b> días (ETA <b>{s.fechaPrev||"—"}</b>)</> : "sin estimación"}
            </div>
          </div>

          <div className="p-3 rounded-2xl border bg-gray-50">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">General</span>
              <span className="text-base font-semibold">{fmt(s.avanceGen,0)}%</span>
            </div>
            <Progress value={Math.max(0,Math.min(100,s.avanceGen||0))}/>
            <div className="mt-2 text-base leading-snug">
              Próxima a <b>{fmt(s.proxGen)}</b> h · Restan <b>{fmt(s.restGen)}</b> h · {s.diasGen!==null ? <>≈ <b>{fmt(Math.ceil(s.diasGen))}</b> días (ETA <b>{s.fechaGen||"—"}</b>)</> : "sin estimación"}
            </div>
          </div>
        </div>

        {/* Permisos ETA */}
        {s.aplicaPermisos && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-2xl border bg-gray-50">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">Revisión Técnica</span>
                <EstadoBadge estado={s.estRT}>RT: {s.estRT}</EstadoBadge>
              </div>
              <div className="text-base leading-snug">
                {e.rtUltima ? <>Próxima <b>{s.fechaRT||"—"}</b> · Restan <b>{fmt(Math.ceil(s.diasRT ?? 0))}</b> días</> : "Sin fecha registrada"}
              </div>
            </div>
            <div className="p-3 rounded-2xl border bg-gray-50">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">Permiso de Circulación</span>
                <EstadoBadge estado={s.estPC}>PC: {s.estPC}</EstadoBadge>
              </div>
              <div className="text-base leading-snug">
                {e.pcUltimo ? <>Próximo <b>{s.fechaPC||"—"}</b> · Restan <b>{fmt(Math.ceil(s.diasPC ?? 0))}</b> días</> : "Sin fecha registrada"}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
