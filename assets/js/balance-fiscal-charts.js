/*
 * Gráficos estáticos de alsina-balance-fiscal-1s2026.html
 * Todos los valores provienen de los informes fuente de Alsina:
 * "Recaudación PBA — 1er Semestre 2026" y "Transferencias 1S 2026"
 * (Ministerio de Economía PBA / ARBA / INDEC). Ningún valor es estimado.
 */
(function(){
  if (typeof Chart === 'undefined') { window.addEventListener('load', init); }
  else { init(); }

  function init(){
    if (typeof Chart === 'undefined') { setTimeout(init, 60); return; }

    const TEAL = '#00D5D8', TEALD = '#007b8a', RISK = '#f0653e', RISKD = '#c2410c';
    const GRID = 'rgba(255,255,255,.07)';
    const TXT = { color:'#94a3b8', font:{ size:11 } };
    const TXTX = { color:'#94a3b8', font:{ size:10 } };

    function bar(id, cfg){ const el = document.getElementById(id); if (el) new Chart(el.getContext('2d'), cfg); }

    // 1) Recaudación total 1S25 vs 1S26 (nominal, con var. real anotada)
    bar('recaudacion-total-chart', {
      type:'bar',
      data:{
        labels:['1S 2025','1S 2026'],
        datasets:[{ data:[6368882,8329354], backgroundColor:[TEALD+'cc', TEAL+'cc'], borderColor:[TEALD, TEAL], borderWidth:1, borderRadius:4 }]
      },
      options:{
        indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: ctx => `$${ctx.parsed.x.toLocaleString('es-AR')} M` } } },
        scales:{ x:{ ticks: TXTX, grid: {color:GRID}, title:{display:true,text:'Millones de $ corrientes',color:'#64748b',font:{size:10}} }, y:{ ticks: TXT, grid:{display:false} } }
      }
    });

    // 2) Variación real mensual de la recaudación total · 2026
    bar('recaudacion-mensual-chart', {
      type:'bar',
      data:{
        labels:['Ene','Feb','Mar','Abr','May','Jun'],
        datasets:[{ data:[4.42,7.65,-4.89,-2.58,-13.38,2.11],
          backgroundColor: v => v.raw >= 0 ? TEAL+'cc' : RISK+'cc',
          borderColor: v => v.raw >= 0 ? TEAL : RISK, borderWidth:1, borderRadius:3 }]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: ctx => `Var. real: ${ctx.parsed.y > 0 ? '+' : ''}${ctx.parsed.y}%` } } },
        scales:{ x:{ ticks:TXT, grid:{display:false} }, y:{ ticks:{ color:'#94a3b8', font:{size:10}, callback:v=>v+'%' }, grid:{color:GRID} } }
      }
    });

    // 3) Composición de la recaudación propia · 1S 2026 (barra apilada horizontal única)
    stackedSingleBar('composicion-chart', [
      { label:'Ingresos Brutos', value:75.56, color: TEAL },
      { label:'Sellos', value:9.76, color:'#e4ab02' },
      { label:'Inmobiliario', value:7.34, color:'#52C78C' },
      { label:'Automotor', value:4.38, color:'#3b82f6' },
      { label:'Otros', value:2.97, color:'#64748b' }
    ]);

    // 4) Variación real por impuesto · barras divergentes desde cero
    bar('variacion-impuesto-chart', {
      type:'bar',
      data:{
        labels:['Ingresos Brutos','Sellos','Inmobiliario','Automotor'],
        datasets:[{ data:[-2.56,-7.23,17.36,-7.75],
          backgroundColor:[RISK+'cc', RISK+'cc', TEAL+'cc', RISK+'cc'],
          borderColor:[RISK, RISK, TEAL, RISK], borderWidth:1, borderRadius:3 }]
      },
      options:{
        indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: ctx => `${ctx.parsed.x > 0 ? '+' : ''}${ctx.parsed.x}% real` } } },
        scales:{
          x:{ ticks:{ color:'#94a3b8', font:{size:10}, callback:v=>v+'%' }, grid:{color:GRID} },
          y:{ ticks:TXT, grid:{display:false} }
        }
      }
    });

    // 5) Evolución mensual por tributo (var. real) — eje recortado, Inmobiliario tiene un pico fuera de escala en febrero (+511%)
    bar('tributos-mensual-chart', {
      type:'line',
      data:{
        labels:['Ene','Feb','Mar','Abr','May','Jun'],
        datasets:[
          { label:'Ingresos Brutos', data:[2.42,-5.76,-2.55,-1.18,-8.75,0.61], borderColor:TEAL, backgroundColor:TEAL, tension:.25, pointRadius:3 },
          { label:'Sellos', data:[5.34,-4.20,-3.20,-9.98,-11.38,-17.03], borderColor:'#e4ab02', backgroundColor:'#e4ab02', tension:.25, pointRadius:3 },
          { label:'Inmobiliario', data:[67.06,511.47,-19.97,-6.13,-64.46,21.42], borderColor:'#52C78C', backgroundColor:'#52C78C', tension:.25, pointRadius:3 },
          { label:'Automotor', data:[54.06,41.28,-9.93,-5.26,-38.35,17.73], borderColor:'#3b82f6', backgroundColor:'#3b82f6', tension:.25, pointRadius:3 }
        ]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ position:'top', labels:{ color:'#94a3b8', font:{size:11}, boxWidth:14 } },
          tooltip:{ callbacks:{ label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y > 0 ? '+' : ''}${ctx.parsed.y}%` } } },
        scales:{
          x:{ ticks:TXT, grid:{display:false} },
          y:{ min:-70, max:90, ticks:{ color:'#94a3b8', font:{size:10}, callback:v=>v+'%' }, grid:{color:GRID} }
        }
      }
    });

    // 6) Composición Nación → Provincia · 1S 2026
    stackedSingleBar('nacion-composicion-chart', [
      { label:'CFI neta (Ley 26.075)', value:60.6, color: TEAL },
      { label:'Financiamiento Educativo', value:21.5, color: TEALD },
      { label:'Compensación Consenso Fiscal', value:11.3, color:'#e4ab02' },
      { label:'Otros 11 conceptos', value:6.6, color:'#64748b' }
    ]);

    // 7) Variación real mensual — Total Nación→Provincia y CFI neta
    bar('nacion-mensual-chart', {
      type:'line',
      data:{
        labels:['Ene','Feb','Mar','Abr','May','Jun'],
        datasets:[
          { label:'Total Nación → Provincia', data:[-5.83,-6.80,-2.43,-2.51,7.45,-3.78], borderColor:TEAL, backgroundColor:TEAL, tension:.25, pointRadius:3 },
          { label:'CFI neta', data:[-21.9,-36.8,-34.2,10.9,35.3,7.83], borderColor:RISK, backgroundColor:RISK, tension:.25, pointRadius:3 }
        ]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ position:'top', labels:{ color:'#94a3b8', font:{size:11}, boxWidth:14 } },
          tooltip:{ callbacks:{ label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y > 0 ? '+' : ''}${ctx.parsed.y}%` } } },
        scales:{
          x:{ ticks:TXT, grid:{display:false} },
          y:{ ticks:{ color:'#94a3b8', font:{size:10}, callback:v=>v+'%' }, grid:{color:GRID} }
        }
      }
    });

    // 8) Composición de lo transferido a municipios · 1S 2026
    stackedSingleBar('municipios-composicion-chart', [
      { label:'Coparticipación', value:75.94, color: TEAL },
      { label:'Fdo. Financiamiento Educativo', value:10.60, color: TEALD },
      { label:'Fdo. Fort. Recursos Municipales', value:4.41, color:'#52C78C' },
      { label:'Fdo. Municipal Inclusión Social', value:3.33, color:'#3b82f6' },
      { label:'Descentralización Tributaria', value:2.10, color:'#e4ab02' },
      { label:'Fdo. Prog. Sociales y San. Amb.', value:1.67, color:'#8b5cf6' },
      { label:'Juegos de Azar', value:1.06, color:'#64748b' },
      { label:'FEFIM', value:0.90, color:'#94a3b8' }
    ]);

    function stackedSingleBar(id, segments){
      const el = document.getElementById(id); if (!el) return;
      new Chart(el.getContext('2d'), {
        type:'bar',
        data:{
          labels:[''],
          datasets: segments.map(s => ({ label:s.label, data:[s.value], backgroundColor:s.color, borderWidth:0 }))
        },
        options:{
          indexAxis:'y', responsive:true, maintainAspectRatio:false,
          plugins:{
            legend:{ position:'bottom', labels:{ color:'#94a3b8', font:{size:10.5}, boxWidth:12, padding:10 } },
            tooltip:{ callbacks:{ label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x}%` } }
          },
          scales:{
            x:{ stacked:true, min:0, max:100, ticks:{ color:'#94a3b8', font:{size:10}, callback:v=>v+'%' }, grid:{color:GRID} },
            y:{ stacked:true, ticks:{ display:false }, grid:{ display:false } }
          }
        }
      });
    }
  }
})();
