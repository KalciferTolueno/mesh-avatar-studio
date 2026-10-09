# Auditoría de diseño (Impeccable `audit`)

Fecha: 9 de octubre de 2026. Alcance: **En vivo** y **Editor**, temas oscuro y claro, escritorio
y móvil (390 px). Método: guía `audit` de la skill Impeccable (solo sus instrucciones; su detector
automático no está instalado), mediciones en el navegador (contraste de cada texto visible,
tamaño de cada control, nombres accesibles, títulos, desbordes) y revisión del CSS.

## Puntuación

| # | Dimensión | Nota | Hallazgo principal |
|---|-----------|------|--------------------|
| 1 | Accesibilidad | 3/4 | Etiquetas de sección del editor con contraste 2,78–3,54:1 (mínimo 4,5) |
| 2 | Rendimiento | 3/4 | Sin problemas de CSS; el coste real es el rastreo y el WebGL, inherente |
| 3 | Temas | 3/4 | Tokens oscuro/claro completos; insignias amarillas fuera de la paleta |
| 4 | Responsive | 2/4 | 64 % de los controles por debajo de 32 px; la cabecera de En vivo se desborda en móvil |
| 5 | Integridad | 2/4 | Tarjetas dentro de tarjetas, iconos hechos con caracteres Unicode, fuente declarada que no se carga |
| **Total** | | **13/20** | **Aceptable** (justo por debajo de «Bien») |

## Veredicto de integridad

**Aprobado con reservas.** La interfaz tiene un sistema propio y coherente (tokens de color,
tema oscuro/claro, morado como acento, esquinas rectas), pero hay piezas que no salen de ese
sistema: insignias amarillas heredadas del panel de iluminación, iconos hechos con caracteres
(▸ ▾ ☀) en vez de dibujados, cajas con borde dentro de secciones con borde, y la fuente «Inter»
declarada pero nunca cargada (se ve Segoe UI sin que nadie lo haya decidido).

## Resumen

- **Hallazgos:** 0 P0 · 2 P1 · 6 P2 · 3 P3.
- **Lo más importante:**
  1. **[P1] Etiquetas de sección ilegibles** en el editor («Cara», «Pelo y accesorios», «Cuerpo», «Avanzado»).
  2. **[P1] Morado sobre lila en el tema claro** (pestaña activa, botones pulsados, insignias, números de la guía): 4,31:1.
  3. **[P2] Insignias amarillas** («ON», «0/1») que rompen la paleta morada.
  4. **[P2] Tarjetas anidadas** (calibración de vocales dentro de su sección).
  5. **[P2] Controles pequeños** (casillas de 13 px, deslizadores de 16 px de alto).

## Hallazgos por gravedad

### P1 — Importantes

**[P1] Contraste de las etiquetas de sección**
- **Dónde:** `src/theme/theme.css` (`--faint`, regla de `.part-section h3` y `.advanced-section > summary`).
- **Medido:** 3,54:1 en oscuro (`#6f6f7b` sobre `#19191d`) y 2,78:1 en claro (`#9a9aa6` sobre blanco).
- **Impacto:** los títulos que ordenan la lista de piezas apenas se leen. **WCAG 1.4.3 (AA).**
- **Arreglo:** `--faint` a `#8b8b97` en oscuro (5,21:1) y `#6f6f7d` en claro (4,95:1).

**[P1] Morado sobre lila en el tema claro**
- **Dónde:** todo texto `var(--accent)` sobre `var(--accent-soft)`: pestaña activa, idioma activo, botones pulsados, insignias y números de la guía.
- **Medido:** 4,31:1 (`#6b5ae6` sobre `#efedff`).
- **Arreglo:** un token `--accent-ink` para texto de acento: `#5544d4` en claro (5,76:1); en oscuro sigue `#a194ff` (5,83:1).

### P2 — Menores

**[P2] Insignias amarillas fuera de la paleta**
- **Dónde:** `.lighting-on` (`src/lighting/lighting.css`): fondo `#fff4cc` y texto `#805000` en los dos temas.
- **Impacto:** en el tema oscuro son los únicos elementos amarillos y parecen avisos.
- **Arreglo:** insignia con los tokens de acento.

**[P2] Tarjetas dentro de tarjetas**
- **Dónde:** `.vowel-calibration` (caja con borde y fondo) dentro de la sección del micrófono, que ya tiene borde.
- **Arreglo:** quitar la caja; separar con espacio y una línea superior.

**[P2] La fuente declarada no se carga**
- **Dónde:** `--font-ui: "Inter", …`. Inter no está instalada ni incluida, así que se ve Segoe UI.
- **Arreglo:** declarar la fuente que realmente se usa, la de Windows 11 (Segoe UI Variable), con el resto de respaldo. Es una herramienta, y la fuente del sistema es la expectativa nativa.

**[P2] Texto demasiado pequeño**
- **Medido:** insignias a 10 px y ayudas a 11 px.
- **Arreglo:** mínimo de 11 px en las insignias, 12 px en las ayudas, y números tabulares en los valores de los deslizadores.

**[P2] Controles pequeños**
- **Medido:** 94 de 147 controles en En vivo y 55 de 92 en el editor miden menos de 32 px en algún lado. Las casillas son de 13×13 y los deslizadores de 16 px de alto.
- **Arreglo:** casillas de 16 px, deslizadores con 24 px de zona táctil y botones con al menos 32 px de alto.

**[P2] Iconos hechos con caracteres**
- **Dónde:** el triángulo ▸/▾ de las secciones (`::before` en `lighting.css`) y el sol ☀ de la luz.
- **Arreglo:** chevron dibujado con CSS que gira al abrir, y un sol en SVG con el mismo trazo que el resto de iconos.

### P3 — Pulido

- **[P3] La cabecera de En vivo se desborda en móvil:** 28 px a 390 px de ancho; el selector de proyecto se corta. Arreglo: que la cabecera se ajuste en varias líneas.
- **[P3] No hay alternativa para `prefers-reduced-motion`:** el movimiento es mínimo, solo transiciones de 0,15 s. Arreglo: anularlas si el sistema pide reducir el movimiento.
- **[P3] Títulos del editor:** se salta un nivel (H1 → H3 «Recientes»). Es estructura del original; se deja anotado.

## Patrones

- **Dos capas de CSS:** las hojas del original (`live.css`, `editor/style.css`, `lighting.css`) usan colores fijos claros y `theme.css` los reemplaza con tokens. Es intencionado, para poder traer actualizaciones del autor, pero cada estilo nuevo del original que no se cubra en `theme.css` reaparece con colores sin tema. Así nacieron las insignias amarillas.

## Lo que funciona bien

- **Contraste:** salvo los dos P1, todo el texto supera 4,5:1 en los dos temas.
- **Nombres accesibles:** ningún control interactivo carece de nombre (0 de 147 en En vivo y 0 de 92 en el editor).
- **Teclado:** anillo de foco visible y con tema (`:focus-visible` en el color de acento).
- **Detalles del navegador con tema:** selección de texto y barras de desplazamiento.
- **Tactil:** arrastrar el avatar usa eventos de puntero, `touch-action: none` y libera la captura al soltar o cancelar.
- **Sin desbordes horizontales:** ni En vivo ni el editor se desbordan a 390 px (salvo la cabecera, P3).

## Acciones recomendadas

1. **[P1] `/impeccable colorize`:** tokens `--faint` y `--accent-ink`; insignias con la paleta.
2. **[P2] `/impeccable typeset`:** fuente real, tamaños mínimos y números tabulares.
3. **[P2] `/impeccable layout`:** quitar la tarjeta anidada y agrandar los controles.
4. **[P2] `/impeccable polish`:** iconos dibujados, `reduced-motion` y cabecera en móvil.

## Resultado tras las mejoras

Las mismas mediciones, repetidas en En vivo y en el editor, con los dos temas:

| # | Dimensión | Antes | Después | Qué cambió |
|---|-----------|-------|---------|------------|
| 1 | Accesibilidad | 3 | **4** | 0 textos bajo 4,5:1 en las 4 combinaciones (antes 13); casillas de 16 px |
| 2 | Rendimiento | 3 | **3** | Sin cambios (el coste es el rastreo y el WebGL) |
| 3 | Temas | 3 | **4** | Insignias con la paleta; token `--accent-ink` para texto de acento |
| 4 | Responsive | 2 | **3** | La cabecera de En vivo ya no se desborda a 390 px; controles de 32 px de alto |
| 5 | Integridad | 2 | **3** | Sin tarjeta anidada; chevrons y sol dibujados; se declara la fuente que se ve |
| **Total** | | **13/20** | **17/20** | **Bien** |

Pendiente, a propósito:
- El sol de la luz conserva su color ámbar, porque representa la luz.
- En el editor, el desplegable «Avanzado» y el selector «Sombreado» siguen midiendo 20 px de alto.
- Los niveles de título del editor no se tocan, porque son estructura del original.
- El detector automático de Impeccable no se ejecutó: no se instaló su programa.
