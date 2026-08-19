# thunderbird-mcp — Instrument-Beobachtungen

(Form: Vorfall + Basis · Klasse · vorformulierter Fix · Konsument/Drain —
Slot-Muster dispatch-guards `dev-notes/OBSERVATIONS-FORM.md`. Drain per
Backlog-Retirement-Quote.)

## 2026-08-19 — rawSource als .eml-Ersatz flutet den Agent-Kontext; das richtige Verb (saveMessage) ist gated und für Sessions unsichtbar

- **Vorfall + Basis:** Session 25-07 B-Plan Bergen (Claude-Session
  `session_01M44JNCCKETVrjurJ8SShS8`): Um eine Angebots-Mail als
  .eml-Beleg abzulegen, zog die Session `getMessage(rawSource=true)` —
  ~15k Token inkl. base64-Inline-Bildern in den Session-Kontext, dort nie
  gebraucht (der Beleg wurde am Ende aus dem bereits geladenen geparsten
  Body als .md-Abschrift geschrieben). Auf einer Top-Tier-Session wird so
  ein Blob mit jedem Folgeturn neu bezahlt. Das passende Verb existiert
  längst: `saveMessage` (mcp-bridge.cjs:787ff., schreibt .eml/Anhänge an
  frei wählbare Pfade) — es ist nach Security-Review (#164, `a4052fb`)
  bewusst opt-in: fehlt in tools/list und verweigert Calls, solange
  `THUNDERBIRD_MCP_SAVE_MESSAGE=1` nicht gesetzt ist (enger:
  `THUNDERBIRD_MCP_SAVE_ROOT`). Eine Session kann das Verb daher nicht
  entdecken und greift zum falschen (rawSource).
- **Klasse:** bewusst weggeschaltetes Werkzeug ohne sichtbaren Wegweiser —
  der Ersatzpfad ist teuer und liegt nahe; die Gate-Entscheidung selbst
  ist richtig (arbiträre Schreib-Primitive gehören gated).
- **Vorformulierter Fix (zwei Hälften, beide klein):** (a)
  Betreiber-Entscheid, ob auf dieser Maschine
  `THUNDERBIRD_MCP_SAVE_MESSAGE=1` + `THUNDERBIRD_MCP_SAVE_ROOT=<hidrive-
  Wurzel o. ä.>` gesetzt wird — mit SAVE_ROOT ist die Angriffsfläche
  begrenzt und der .eml-Beleg-Weg (ProjektePrivat-Ablage) wird gangbar;
  (b) unabhängig davon: die `rawSource`-Beschreibung in getMessage/
  getMessages um einen Satz ergänzen „für Datei-Ablage NICHT rawSource
  ziehen — saveMessage (gated, env …) ist das Verb dafür", damit der
  teure Ersatzpfad auf das gated Verb zeigt statt es zu verdecken.
- **Konsument/Drain:** (a) Betreiber (env-Entscheid, eine Zeile in der
  MCP-Konfiguration); (b) nächste Wartungs-Session an diesem Repo. Drain
  beim Einbau oder Verwurf mit Ein-Zeilen-Begründung.

## 2026-08-19 — searchMessages liefert ungekappte recipients-Listen; eine Trefferzeile kann 5+ KB wiegen

- **Vorfall + Basis:** gleiche Session, Suche `Bergen` (maxResults 30): eine
  einzelne Antwort ~44 KB (~11k Token), dominiert von Newsletter-Treffern,
  deren `recipients`-Feld je 60–80 volle Adressen trägt (purusha.de-
  Verteiler). Für die Suchentscheidung („relevant j/n") sind Betreff,
  Absender, Datum, Preview nötig — die Empfängerliste fast nie.
- **Klasse:** unbounded Feld in Listen-Antwort; Kosten skalieren mit fremdem
  Verteilerverhalten statt mit dem Informationsbedarf des Suchenden.
- **Vorformulierter Fix:** `recipients`/`ccList` in searchMessages-/
  getRecentMessages-Zeilen serverseitig kappen (z. B. erste 3 Adressen +
  `… (+N weitere)`), volle Listen weiterhin über getMessage; optional
  Parameter `fullRecipients: true`.
- **Konsument/Drain:** nächste Wartungs-Session an diesem Repo; Drain beim
  Einbau oder Verwurf mit Ein-Zeilen-Begründung.
