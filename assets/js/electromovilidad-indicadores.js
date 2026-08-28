/* ALSINA — catálogo único de indicadores del informe de Electromovilidad
   Zona Norte. Fuente de verdad para el glosario, los tooltips de la
   síntesis, las columnas del dashboard y las variables del mapa — nada de
   esto se debe re-tipear en electromovilidad-app.js ni en el HTML.
   Contenido público (son definiciones metodológicas, no datos privados). */
(function () {
  const FMT = {
    entero: (n) => (n == null ? 's/d' : Math.round(n).toLocaleString('es-AR')),
    decimal1: (n) => (n == null ? 's/d' : Number(n).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })),
    decimal2: (n) => (n == null ? 's/d' : Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
    moneda: (n) => (n == null ? 's/d' : '$' + Math.round(n).toLocaleString('es-AR')),
    monedaM: (n) => (n == null ? 's/d' : '$' + (n / 1e6).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' M'),
    porcentaje: (n) => (n == null ? 's/d' : (n * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'),
  };

  // categoria: agrupa para los filtros del dashboard y el explorador.
  // enSintesis / enMapa / enFicha / enDashboard: en qué secciones aparece.
  const INDICADORES = [
    {
      key: 'poblacion2022', categoria: 'demografia', nombre: 'Población (2022)', unidad: 'habitantes',
      formato: 'entero', porHabitante: false,
      definicion: 'Población total del partido según el Censo Nacional 2022 (INDEC).',
      formula: 'Dato censal directo.',
      utilidad: 'Referencia de escala para interpretar cualquier otro indicador del municipio.',
      limitacion: 'No refleja población flotante ni estacional (turismo, segunda vivienda).',
      enDashboard: true, enFicha: true,
    },
    {
      key: 'poblacion2010', categoria: 'demografia', nombre: 'Población (2010)', unidad: 'habitantes',
      formato: 'entero', porHabitante: false,
      definicion: 'Población total del partido según el Censo Nacional 2010 (INDEC).',
      formula: 'Dato censal directo.',
      utilidad: 'Punto de partida para medir el crecimiento poblacional 2010–2022.',
      limitacion: 'Los límites de radios censales pueden variar levemente entre censos.',
      enDashboard: true, enFicha: true,
    },
    {
      key: 'crecimientoPoblacional', categoria: 'demografia', nombre: 'Crecimiento poblacional 2010–2022', unidad: '%',
      formato: 'porcentaje', porHabitante: false,
      definicion: 'Variación porcentual de la población entre el Censo 2010 y el Censo 2022.',
      formula: '(Población 2022 − Población 2010) / Población 2010.',
      utilidad: 'Contextualiza si un municipio está creciendo, lo que puede asociarse a mayor demanda futura de movilidad e infraestructura.',
      limitacion: 'No distingue crecimiento vegetativo de migración interna.',
      enDashboard: true, enFicha: true, enMapa: true,
    },
    {
      key: 'superficieKm2', categoria: 'demografia', nombre: 'Superficie', unidad: 'km²',
      formato: 'decimal1', porHabitante: false,
      definicion: 'Superficie del partido en kilómetros cuadrados.',
      formula: 'Dato oficial de la Provincia de Buenos Aires.',
      utilidad: 'Permite calcular densidad y contextualizar la extensión territorial a cubrir con infraestructura.',
      limitacion: 'No distingue superficie urbanizada de superficie rural o de humedales.',
      enDashboard: true, enFicha: true,
    },
    {
      key: 'densidad2022', categoria: 'demografia', nombre: 'Densidad poblacional', unidad: 'hab/km²',
      formato: 'entero', porHabitante: false,
      definicion: 'Población 2022 dividida por la superficie del partido.',
      formula: 'Población 2022 / Superficie (km²).',
      utilidad: 'Indica concentración urbana, relevante para pensar la ubicación de infraestructura pública.',
      limitacion: 'Promedia zonas muy densas con zonas de baja densidad dentro del mismo partido.',
      enDashboard: true, enFicha: true,
    },
    {
      key: 'ceroKm', categoria: 'mercado-0km', nombre: '0 km radicados (ene–jul 2026)', unidad: 'vehículos',
      formato: 'decimal1', porHabitante: false, parKey: 'ceroKmPorMilHab',
      definicion: 'Vehículos 0 km inscriptos por primera vez (radicación inicial) según la localidad del titular, entre enero y julio de 2026.',
      formula: 'Suma de inscripciones iniciales DNRPA asignadas al partido vía GeoRef, ponderadas por porcentaje de titularidad en casos de cotitularidad.',
      utilidad: 'Magnitud del mercado automotor nuevo de cada municipio en el período.',
      limitacion: 'No equivale exactamente a compras realizadas físicamente en concesionarios del municipio: mide domicilio del titular, no punto de venta. Al estar ponderado por titularidad, puede no ser un número entero.',
      enSintesis: true, enDashboard: true, enFicha: true, enMapa: true,
    },
    {
      key: 'ceroKmPorMilHab', categoria: 'mercado-0km', nombre: '0 km cada 1.000 habitantes', unidad: 'vehículos/1.000 hab.',
      formato: 'decimal2', porHabitante: true, parKey: 'ceroKm',
      definicion: 'Intensidad relativa de radicaciones de 0 km, normalizada por población.',
      formula: '(0 km radicados / Población 2022) × 1.000.',
      utilidad: 'Permite comparar municipios de distinto tamaño sin que la escala poblacional distorsione la comparación.',
      limitacion: 'No equivale exactamente a compras realizadas físicamente en concesionarios del municipio.',
      enDashboard: true, enFicha: true, enMapa: true,
    },
    {
      key: 'ceroKmPremium', categoria: 'perfil-titular', nombre: 'Vehículos premium (0 km)', unidad: 'vehículos',
      formato: 'decimal1', porHabitante: false,
      definicion: 'Cantidad de 0 km radicados clasificados en el segmento premium según la valuación DNRPA.',
      formula: 'Suma ponderada de unidades cuya valuación DNRPA corresponde al segmento premium del clasificador utilizado.',
      utilidad: 'Aproxima el peso del segmento de mayor valor dentro del parque nuevo radicado.',
      limitacion: 'La frontera "premium" depende del clasificador de valuación utilizado, no es una categoría oficial DNRPA.',
      enDashboard: true, enFicha: true,
    },
    {
      key: 'participacionPremium', categoria: 'perfil-titular', nombre: 'Participación de vehículos premium', unidad: '%',
      formato: 'porcentaje', porHabitante: false,
      definicion: 'Proporción de los 0 km radicados que corresponden al segmento premium.',
      formula: 'Vehículos premium / 0 km radicados.',
      utilidad: 'Indica el peso relativo del segmento de mayor valor en la composición del mercado nuevo local.',
      limitacion: 'Depende del mismo clasificador de valuación que "vehículos premium".',
      enDashboard: true, enFicha: true,
    },
    {
      key: 'titularesJuridicos', categoria: 'perfil-titular', nombre: 'Participación de titulares jurídicos', unidad: '%',
      formato: 'porcentaje', porHabitante: false,
      definicion: 'Proporción de 0 km radicados a nombre de una persona jurídica (empresa) en vez de una persona física.',
      formula: 'Unidades con titular jurídico / 0 km radicados.',
      utilidad: 'Distingue demanda corporativa/flotas de demanda de consumidores individuales.',
      limitacion: 'No identifica el rubro de la empresa titular ni si el vehículo es para uso de flota o para un empleado.',
      enDashboard: true, enFicha: true,
    },
    {
      key: 'transferencias', categoria: 'mercado-usados', nombre: 'Transferencias de usados (ene–jul 2026)', unidad: 'vehículos',
      formato: 'decimal1', porHabitante: false, parKey: 'transferenciasPorMilHab',
      definicion: 'Transferencias de dominio de automotores usados radicadas según la localidad del titular, enero–julio 2026.',
      formula: 'Suma de transferencias DNRPA asignadas al partido vía GeoRef, ponderadas por porcentaje de titularidad.',
      utilidad: 'Magnitud del mercado de usados, generalmente mucho mayor que el de 0 km.',
      limitacion: 'No distingue motivo de la transferencia (venta, herencia, regularización) ni antigüedad del vehículo transferido.',
      enSintesis: true, enDashboard: true, enFicha: true, enMapa: true,
    },
    {
      key: 'transferenciasPorMilHab', categoria: 'mercado-usados', nombre: 'Transferencias cada 1.000 habitantes', unidad: 'vehículos/1.000 hab.',
      formato: 'decimal2', porHabitante: true, parKey: 'transferencias',
      definicion: 'Intensidad relativa de transferencias de usados, normalizada por población.',
      formula: '(Transferencias / Población 2022) × 1.000.',
      utilidad: 'Compara la rotación del parque usado entre municipios de distinto tamaño.',
      limitacion: 'No distingue motivo de la transferencia ni antigüedad del vehículo.',
      enDashboard: true, enFicha: true,
    },
    {
      key: 'valorFiscalCeroKm', categoria: 'valor-fiscal', nombre: 'Valor fiscal estimado de los 0 km', unidad: 'ARS',
      formato: 'monedaM', porHabitante: false, parKey: 'valorFiscalPorHabitante',
      definicion: 'Suma de la valuación fiscal DNRPA de los 0 km radicados en el período.',
      formula: 'Suma de (valuación DNRPA por código de fabricante/tipo/modelo × unidades ponderadas), con la tabla vigente desde agosto de 2026.',
      utilidad: 'Aproxima la magnitud económica del parque nuevo incorporado en cada municipio.',
      limitacion: 'No representa precios efectivos de venta ni facturación comercial de concesionarios: es una valuación fiscal, no un precio de mercado.',
      enSintesis: true, enDashboard: true, enFicha: true, enMapa: true,
    },
    {
      key: 'valorFiscalPorHabitante', categoria: 'valor-fiscal', nombre: 'Valor fiscal estimado por habitante', unidad: 'ARS/hab.',
      formato: 'moneda', porHabitante: true, parKey: 'valorFiscalCeroKm',
      definicion: 'Valor fiscal estimado de los 0 km, normalizado por población.',
      formula: 'Valor fiscal estimado de los 0 km / Población 2022.',
      utilidad: 'Compara la magnitud económica del mercado nuevo entre municipios de distinto tamaño.',
      limitacion: 'Hereda las limitaciones del valor fiscal estimado: no es precio de mercado.',
      enDashboard: true, enFicha: true, enMapa: true,
    },
    {
      key: 'ticketFiscalPromedio', categoria: 'valor-fiscal', nombre: 'Ticket fiscal promedio', unidad: 'ARS',
      formato: 'moneda', porHabitante: false,
      definicion: 'Valuación fiscal promedio por vehículo 0 km radicado en el municipio.',
      formula: 'Valor fiscal estimado de los 0 km / 0 km radicados.',
      utilidad: 'Aproxima el nivel de gama promedio del mercado nuevo local.',
      limitacion: 'Un promedio puede ocultar dispersión entre segmentos de entrada y segmentos premium.',
      enDashboard: true, enFicha: true,
    },
    {
      key: 'bev', categoria: 'electromovilidad', nombre: 'Vehículos BEV', unidad: 'vehículos',
      formato: 'decimal1', porHabitante: false,
      definicion: 'Vehículos eléctricos a batería (Battery Electric Vehicle) radicados en el período, sin motor de combustión.',
      formula: 'Clasificación propia de la descripción de modelo DNRPA. Excluye HEV y MHEV, que no requieren carga externa.',
      utilidad: 'Mide la radicación del segmento 100% eléctrico, el que más depende de infraestructura de carga.',
      limitacion: 'El clasificador BEV/PHEV es propio y debe revisarse en cada actualización de catálogo de modelos.',
      enSintesis: true, enDashboard: true, enFicha: true, enMapa: true,
    },
    {
      key: 'phev', categoria: 'electromovilidad', nombre: 'Vehículos PHEV', unidad: 'vehículos',
      formato: 'decimal1', porHabitante: false,
      definicion: 'Vehículos híbridos enchufables (Plug-in Hybrid Electric Vehicle) radicados en el período: combinan motor eléctrico y de combustión, con puerto de carga externo.',
      formula: 'Clasificación propia de la descripción de modelo DNRPA. Excluye HEV y MHEV, que no requieren carga externa.',
      utilidad: 'Mide la radicación del segmento híbrido enchufable, que también demanda carga externa aunque en menor medida que un BEV.',
      limitacion: 'El clasificador BEV/PHEV es propio y debe revisarse en cada actualización de catálogo de modelos.',
      enSintesis: true, enDashboard: true, enFicha: true, enMapa: true,
    },
    {
      key: 'enchufables', categoria: 'electromovilidad', nombre: 'Total de vehículos enchufables (BEV + PHEV)', unidad: 'vehículos',
      formato: 'decimal1', porHabitante: false, parKey: 'enchufablesPorDiezMilHab',
      definicion: 'Suma de BEV y PHEV: el universo que efectivamente requiere conexión a un punto de carga externo.',
      formula: 'BEV + PHEV.',
      utilidad: 'Es la base correcta para dimensionar demanda de carga — no debe reemplazarse por el total de "electrificados" (que además incluye HEV y MHEV, que no cargan externamente).',
      limitacion: 'No indica dónde circula ni dónde carga habitualmente cada vehículo.',
      enDashboard: true, enFicha: true, enMapa: true,
    },
    {
      key: 'enchufablesPorCeroKm', categoria: 'electromovilidad', nombre: 'Participación de enchufables sobre los 0 km', unidad: '%',
      formato: 'porcentaje', porHabitante: false,
      definicion: 'Proporción de los 0 km radicados que son BEV o PHEV.',
      formula: 'Enchufables / 0 km radicados.',
      utilidad: 'Mide qué tan penetrada está la electromovilidad dentro del mercado nuevo local.',
      limitacion: 'Un municipio con mercado 0 km chico puede tener una participación alta con pocas unidades absolutas.',
      enDashboard: true, enFicha: true,
    },
    {
      key: 'enchufablesPorDiezMilHab', categoria: 'electromovilidad', nombre: 'Enchufables cada 10.000 habitantes', unidad: 'vehículos/10.000 hab.',
      formato: 'decimal2', porHabitante: true, parKey: 'enchufables',
      definicion: 'Presencia de vehículos enchufables (BEV + PHEV) normalizada por población.',
      formula: '(Enchufables / Población 2022) × 10.000.',
      utilidad: 'Compara la penetración territorial de la electromovilidad entre municipios de distinto tamaño.',
      limitacion: 'No permite saber dónde circula o se carga habitualmente cada vehículo.',
      enDashboard: true, enFicha: true, enMapa: true,
    },
    {
      key: 'sitiosCargaMin', categoria: 'infraestructura', nombre: 'Sitios públicos de carga identificados (mínimo)', unidad: 'sitios',
      formato: 'entero', porHabitante: false,
      definicion: 'Cantidad mínima de establecimientos con carga pública identificados por nombre en el relevamiento utilizado.',
      formula: 'Conteo de sitios identificados por redes de operadores (Chargebox, YPF, Shell) y fichas puntuales de PlugShare, al 25/8/2026.',
      utilidad: 'Da una cota inferior de la infraestructura pública disponible — nunca un total exhaustivo.',
      limitacion: 'No es un censo exhaustivo. Un valor de cero significa "sin sitios identificados en el relevamiento utilizado", no "ausencia comprobada". Un sitio publicado no garantiza que esté operativo. "Sitio" no equivale a cantidad de conectores.',
      enSintesis: true, enDashboard: true, enFicha: true, enMapa: true,
    },
    {
      key: 'enchufablesPorSitio', categoria: 'infraestructura', nombre: 'Enchufables por sitio identificado', unidad: 'vehículos/sitio',
      formato: 'decimal1', porHabitante: false,
      definicion: 'Relación entre vehículos enchufables radicados y la cantidad mínima de sitios de carga identificados.',
      formula: 'Enchufables / Sitios públicos de carga identificados (mínimo).',
      utilidad: 'Indicador exploratorio de la relación entre demanda registrada y oferta mínima identificada.',
      limitacion: 'Es exploratorio: el inventario de cargadores no es exhaustivo y no contiene la cantidad de conectores de cada sitio. No calculable cuando no hay sitios identificados (se muestra "s/d", no cero ni infinito).',
      enDashboard: true, enFicha: true, enMapa: true,
    },
  ];

  const BY_KEY = new Map(INDICADORES.map((i) => [i.key, i]));

  function formatValue(key, value) {
    const ind = BY_KEY.get(key);
    if (!ind) return value == null ? 's/d' : String(value);
    return FMT[ind.formato] ? FMT[ind.formato](value) : String(value);
  }

  const CATEGORIAS = [
    { key: 'demografia', label: 'Perfil demográfico' },
    { key: 'mercado-0km', label: 'Mercado 0 km' },
    { key: 'mercado-usados', label: 'Mercado de usados' },
    { key: 'valor-fiscal', label: 'Valor fiscal' },
    { key: 'perfil-titular', label: 'Perfil del titular' },
    { key: 'electromovilidad', label: 'Electromovilidad' },
    { key: 'infraestructura', label: 'Infraestructura' },
  ];

  window.ALSINA_EM_INDICADORES = { INDICADORES, BY_KEY, CATEGORIAS, formatValue, FMT };
})();
