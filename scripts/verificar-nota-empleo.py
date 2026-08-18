"""
Verificación de cifras — nota "Un empleo cada 23 vecinos".

Recalcula desde datos_municipios.json (134 partidos, fuente única de la
herramienta interactiva) todos los números que aparecen en el cuerpo del
artículo nota-un-empleo-cada-23-vecinos.html y falla si alguno se desvía
más de la tolerancia esperada.

Dos cifras del texto NO reproducen el docx original ("Nota empleo
alsina.docx"): la tabla por anillos (tercer cordón e interior bonaerense)
y la fila "Resto de la Provincia". El dataset y el docx no cierran ahí
—probablemente por una diferencia en la clasificación de cordón o en la
base usada para esa tabla en el documento original—, y la definición
fue: publicar los valores recalculados desde el JSON (ver conversación
de la tarea). Este script verifica los valores PUBLICADOS (los del
JSON), no los del docx.

Uso:
    python3 scripts/verificar-nota-empleo.py

Sale con código 0 si todo pasa, 1 si algo se desvía. Pensado para correr
en CI o a mano antes de publicar cualquier cambio de copy o de datos.
"""
import json
import statistics
import sys

DATA_PATH = 'datos_municipios.json'

FAILS = []
CHECKS = 0


def check(label, actual, expected, tol, unit=''):
    global CHECKS
    CHECKS += 1
    ok = abs(actual - expected) <= tol
    mark = 'OK  ' if ok else 'FAIL'
    print(f'[{mark}] {label}: actual={actual:.2f}{unit}  esperado={expected}{unit}  tol=±{tol}{unit}')
    if not ok:
        FAILS.append(label)


def agg_rate(rows, emp_key, pob_key='pob'):
    """Tasa agregada (no promedio de tasas): sum(empleo)/sum(pob)*1000."""
    pob16 = sum(d['pob_2016'] for d in rows)
    pob23 = sum(d['pob_2023'] for d in rows)
    e16 = sum(d[f'{emp_key}_2016'] for d in rows)
    e23 = sum(d[f'{emp_key}_2023'] for d in rows)
    return e16 / pob16 * 1000, e23 / pob23 * 1000, pob16, pob23, e16, e23


def main():
    with open(DATA_PATH, encoding='utf-8') as f:
        data = json.load(f)

    check('total de partidos en el dataset', len(data), 134, 0)

    gba = [d for d in data if d['es_gba24'] == 'Sí']
    resto = [d for d in data if d['es_gba24'] == 'No']
    check('partidos GBA24', len(gba), 24, 0)
    check('partidos resto de la Provincia', len(resto), 110, 0)

    # ── Capítulo 1: dos números que no encajan ──────────────────────
    pob16_g, pob23_g, = sum(d['pob_2016'] for d in gba), sum(d['pob_2023'] for d in gba)
    ep16_g, ep23_g = sum(d['emp_priv_2016'] for d in gba), sum(d['emp_priv_2023'] for d in gba)
    d_pob_gba = pob23_g - pob16_g
    d_emp_gba = ep23_g - ep16_g
    check('GBA24 — población nueva 2016→2023', d_pob_gba, 849562, 0, ' hab.')
    check('GBA24 — var. de población', d_pob_gba / pob16_g * 100, 7.9, 0.05, '%')
    check('GBA24 — empleo privado nuevo 2016→2023', d_emp_gba, 37214, 40, ' puestos')
    check('GBA24 — 1 empleo nuevo cada X habitantes nuevos', round(d_pob_gba / d_emp_gba), 23, 0)

    pob16_r, pob23_r = sum(d['pob_2016'] for d in resto), sum(d['pob_2023'] for d in resto)
    ep16_r, ep23_r = sum(d['emp_priv_2016'] for d in resto), sum(d['emp_priv_2023'] for d in resto)
    d_pob_resto = pob23_r - pob16_r
    d_emp_resto = ep23_r - ep16_r
    check('Resto Provincia — población nueva 2016→2023', d_pob_resto, 348812, 0, ' hab.')
    check('Resto Provincia — var. de población', d_pob_resto / pob16_r * 100, 5.7, 0.05, '%')
    check('Resto Provincia — 1 empleo nuevo cada X habitantes nuevos', round(d_pob_resto / d_emp_resto), 7, 0)

    # ── Capítulo 2: la forma correcta de medirlo ────────────────────
    t16_g, t23_g = ep16_g / pob16_g * 1000, ep23_g / pob23_g * 1000
    check('GBA24 — tasa priv. x mil hab. 2016', t16_g, 164.4, 0.1)
    check('GBA24 — tasa priv. x mil hab. 2023', t23_g, 155.6, 0.1)

    t16_r, t23_r = ep16_r / pob16_r * 1000, ep23_r / pob23_r * 1000
    # NOTA: valores recalculados desde el JSON — no coinciden con el docx
    # (150,5→150,1). Ver definición en la cabecera de este archivo.
    check('Resto Provincia — tasa priv. x mil hab. 2016 (recalculado)', t16_r, 150.8, 0.1)
    check('Resto Provincia — tasa priv. x mil hab. 2023 (recalculado)', t23_r, 150.4, 0.1)

    faltantes_gba = round(t16_g / 1000 * pob23_g - ep23_g)
    faltantes_resto = round(t16_r / 1000 * pob23_r - ep23_r)
    check('GBA24 — puestos que faltan para sostener la tasa de 2016', faltantes_gba, 102460, 50, ' puestos')
    check('Resto Provincia — puestos que faltan (recalculado)', faltantes_resto, 2677, 30, ' puestos')

    # ── Capítulo 3: anillos ──────────────────────────────────────────
    # NOTA: tercer cordón e interior recalculados desde el JSON — no
    # coinciden con el docx (51,1→49,8, 63% / 26,6→26,4, 43%).
    anillos_esperado = {
        'Primer cordón':      dict(t16=46.5, t23=42.6, pct_baja=100),
        'Segundo cordón':     dict(t16=35.2, t23=31.4, pct_baja=93),
        'Tercer cordón':      dict(t16=51.9, t23=50.4, pct_baja=69),   # recalculado
        'Gran La Plata':      dict(t16=15.4, t23=14.8, pct_baja=67),
        'Interior bonaerense': dict(t16=27.2, t23=27.0, pct_baja=46),  # recalculado
    }
    for cordon, exp in anillos_esperado.items():
        rows = [d for d in data if d['cordon'] == cordon]
        t16, t23, *_ = agg_rate(rows, 'emp_ind')
        pct_baja = sum(1 for d in rows if d['var_tasa_ind'] < 0) / len(rows) * 100
        check(f'{cordon} — tasa ind. x mil hab. 2016', t16, exp['t16'], 0.1)
        check(f'{cordon} — tasa ind. x mil hab. 2023', t23, exp['t23'], 0.1)
        check(f'{cordon} — % de municipios con menos empleo ind. x hab.', pct_baja, exp['pct_baja'], 1, '%')

    check('Primer cordón — municipios en el ring', len([d for d in data if d['cordon'] == 'Primer cordón']), 10, 0)
    check('Segundo cordón — municipios en el ring', len([d for d in data if d['cordon'] == 'Segundo cordón']), 14, 0)

    # ── Capítulo 4: los casos más severos ───────────────────────────
    by_name = {d['partido']: d for d in data}
    casos_esperado = {
        'La Matanza':        dict(pob=15.9, ind=-7.5, tasa=-20.3),
        'Merlo':              dict(pob=8.7,  ind=-4.2, tasa=-11.9),
        'Tigre':               dict(pob=12.9, ind=-0.3, tasa=-11.6),
        'Florencio Varela':    dict(pob=12.2, ind=0.1,  tasa=-10.8),
        'Lomas de Zamora':     dict(pob=2.6,  ind=-7.9, tasa=-10.3),
        'Vicente López':       dict(pob=-1.0, ind=-11.1, tasa=-10.2),
    }
    for nombre, exp in casos_esperado.items():
        d = by_name[nombre]
        check(f'{nombre} — var. población', d['var_pob'] * 100, exp['pob'], 0.15, '%')
        check(f'{nombre} — var. empleo industrial', d['var_emp_ind'] * 100, exp['ind'], 0.15, '%')
        check(f'{nombre} — var. empleo ind. x habitante', d['var_tasa_ind'] * 100, exp['tasa'], 0.15, '%')

    # La Matanza: mayor caída de tasa industrial del conurbano
    peor = min(gba, key=lambda d: d['var_tasa_ind'])
    check('La Matanza es el partido con mayor caída de tasa ind. en GBA24',
          1 if peor['partido'] == 'La Matanza' else 0, 1, 0)

    # ── Capítulo 5: Ezeiza ───────────────────────────────────────────
    ez = by_name['Ezeiza']
    check('Ezeiza — var. población', ez['var_pob'] * 100, 18.4, 0.15, '%')
    check('Ezeiza — empleo industrial 2016', ez['emp_ind_2016'], 5477, 0, ' puestos')
    check('Ezeiza — empleo industrial 2023', ez['emp_ind_2023'], 7213, 0, ' puestos')
    check('Ezeiza — var. empleo industrial', ez['var_emp_ind'] * 100, 31.7, 0.15, '%')
    check('Ezeiza — var. empleo ind. x habitante', ez['var_tasa_ind'] * 100, 11.3, 0.15, '%')

    mayor_creci = max(gba, key=lambda d: d['var_pob'])
    check('Ezeiza es el partido con mayor crecimiento poblacional del GBA24',
          1 if mayor_creci['partido'] == 'Ezeiza' else 0, 1, 0)

    perdieron_ind = sum(1 for d in gba if d['var_tasa_ind'] < 0)
    check('Partidos del GBA24 que perdieron empleo ind. x habitante', perdieron_ind, 23, 0)
    ganaron = [d['partido'] for d in gba if d['var_tasa_ind'] >= 0]
    check('Único partido del GBA24 que ganó empleo ind. x habitante es Ezeiza',
          1 if ganaron == ['Ezeiza'] else 0, 1, 0)

    # ── Primer y segundo cordón: unanimidad / casi unanimidad ───────
    primer = [d for d in data if d['cordon'] == 'Primer cordón']
    check('Primer cordón — TODOS perdieron empleo ind. x hab.',
          sum(1 for d in primer if d['var_tasa_ind'] < 0), 10, 0)
    segundo = [d for d in data if d['cordon'] == 'Segundo cordón']
    perdieron_seg = sum(1 for d in segundo if d['var_tasa_ind'] < 0)
    check('Segundo cordón — perdieron empleo ind. x hab. (todos salvo Ezeiza)', perdieron_seg, 13, 0)

    # ── Control demográfico (mencionado en la ficha metodológica) ───
    # No verificable desde datos_municipios.json (requiere edad mediana
    # por Censo 2022, campo no incluido en este dataset). Se deja
    # constancia acá para que quede explícito qué NO cubre este script.
    print('\n[INFO] "Control demográfico" (edad mediana 32,7 vs 33,6, Censo 2022) no se '
          'verifica acá: ese dato no está en datos_municipios.json.')

    print(f'\n{CHECKS - len(FAILS)}/{CHECKS} checks OK.')
    if FAILS:
        print(f'\n{len(FAILS)} check(s) fuera de tolerancia:')
        for f in FAILS:
            print(f'  - {f}')
        sys.exit(1)
    print('Todo dentro de tolerancia.')


if __name__ == '__main__':
    main()
