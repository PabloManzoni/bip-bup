# bip-bup 🤖

Un mod para Claude Code que hace "bip bup bip", como una computadora de dibujito pensando, cuando un pedido se pone largo o pesado. Así no te sorprende un pedido que creías corto y termina tardando media hora o consumiendo muchos tokens.

Suena una vez por pedido, la primera vez que pasa alguna de estas cosas:

- el pedido lleva más de 90 segundos y sigue,
- se lanzan 2 o más subagentes, o arranca un workflow,
- el consumo de tokens pasa un umbral (ponderado por precio: leer contexto cacheado pesa poco y lo que Claude escribe pesa mucho).

También muestra un aviso que dice por qué sonó. Los umbrales están al principio de `hooks/register.ts`.

El sonido se reproduce en macOS. En Linux y Windows el aviso aparece igual, pero no suena.

## Instalación

En el prompt de una sesión de Claude Code en la terminal:

```
/plugin install bip-bup --marketplace PabloManzoni/bip-bup
```

Respondé `y` para agregar el marketplace y elegí el alcance con Enter.

Desde una shell:

```bash
claude plugin install bip-bup --marketplace PabloManzoni/bip-bup
```

En la app de escritorio, donde `/plugin` no está disponible: hacé clic en **+** junto al cuadro del prompt, después **Plugins**, **Add marketplace** con `PabloManzoni/bip-bup`, y después **Add plugin**.
