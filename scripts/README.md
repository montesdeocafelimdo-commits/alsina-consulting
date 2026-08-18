# Scripts

## verificar-nota-empleo.py

Recalcula desde `datos_municipios.json` (134 partidos) todas las cifras que
aparecen en el cuerpo de `nota-un-empleo-cada-23-vecinos.html` y falla si
alguna se desvía de lo publicado más allá de la tolerancia esperada.

```
python3 scripts/verificar-nota-empleo.py
```

Sale con código 0 si todo pasa, 1 si algo se desvía — se puede engancharse
a un hook de pre-commit o a CI. Por ahora corre a mano antes de publicar
cualquier cambio de copy o de datos en esa nota.

Nota: dos de las cifras que verifica (tabla por anillos del tercer cordón e
interior bonaerense, y la fila "Resto de la Provincia") difieren a propósito
del documento de trabajo editorial original ("Nota empleo alsina.docx") — el
script verifica los valores efectivamente publicados en el HTML (recalculados
desde el JSON), no los del documento de trabajo. El detalle de esa decisión
está documentado en los comentarios del propio script y en la ficha
metodológica al pie de la nota.
