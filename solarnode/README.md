# Theme `solarnode`

Custom RenderCV-theme voor deze repository. De map **moet** naast [`cv.yaml`](../cv.yaml) staan en alleen kleine letters/cijfers in de naam hebben (`^[a-z0-9]+$`).

## Wat zit erin?

| Bestand | Rol |
| --- | --- |
| `__init__.py` | Design-opties (defaults: A4, Solarnode-navy) |
| `Preamble.j2.typ` | Typst setup / `#show: rendercv.with(...)` |
| `Header.j2.typ` | Naam, headline, contactregels |
| `SectionBeginning.j2.typ` / `SectionEnding.j2.typ` | Sectiekaders |
| `entries/*.j2.typ` | Layout per entry-type |

Templates zijn Jinja2 + Typst. Verwijder bestanden die je niet overschrijft: RenderCV valt dan terug op de ingebouwde templates.

## Gebruik

In `cv.yaml`:

```yaml
design:
  theme: solarnode
```

Daarna:

```bash
make render
```

Documentatie: [Override default templates](https://docs.rendercv.com/user_guide/how_to/override_default_templates/).
