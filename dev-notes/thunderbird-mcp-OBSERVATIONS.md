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

## 2026-10-21 — Thunderbird-Arbeit am Entwurfs-Veto-Punkt: Tabs sind unsichtbar, springen still, und „Draft replaced" lässt den Vorgänger liegen

Ein Bündel aus einer Session (Georgendorf-Leitungsanfragen, Claude-Session
`session_016Bp6Z4wB2egdnrJwgbiHnp`, Betterbird 153.3.0esr-bb9, Zweig
`feat/edit-draft` installiert). Betreiber-Entscheid derselben Session: die
fehlenden Verben werden GEBAUT, Tab-Werkzeuge zuerst — der Betreiber prüft
Entwürfe ab jetzt in Thunderbird-Tabs statt im Chat (pbs-office R10 Nr. 1).

- **Vorfall + Basis:**
  (1) Ein Tab mit einem Entwurf SPRINGT auf die Nachbar-Nachricht des
  Ordners, sobald der Entwurf gesendet oder gelöscht wird — ohne Meldung.
  Belegt mit vorab benannter Prognose: Test-Entwurf per `displayMessage`
  (tab) geöffnet, per `deleteMessages` gelöscht → der Tab zeigte danach den
  Nachbar-Entwurf (Betreiber-Screenshot). Davor zweimal im Echtbetrieb: der
  Tab des gesendeten Telekom-Entwurfs zeigte danach einen fremden
  Condor-Entwurf (session.json: dieselbe Tab-Position, `Drafts#3446`); am
  Vormittag zeigten mehrere Tabs fremde Mails, nachdem ihre Entwürfe per
  Replace/Delete ersetzt worden waren.
  (2) Kein Werkzeug sieht die Tabs. `session.json` im Profil trägt sie
  (messageURI + Titel), wird aber träge geschrieben — ein neuer Tab stand
  90 s später noch nicht drin; als Live-Instrument unbrauchbar.
  (3) `saveDraft(replaceMessageId)` meldete fünfmal „Draft replaced" und
  ließ fünfmal den Vorgänger im Drafts-Ordner (IMAP, Kasserver); entfernt
  erst per `deleteMessages`. Code: `msgToReplace` geht an
  `createAndSendMessage` (`f6fa182`) — wie Thunderbird es auf IMAP
  behandelt, ist UNGEPRÜFT (Kandidaten: Lösch-Modell „nur markieren" ohne
  Expunge, oder msgToReplace wird bei SaveAsDraft ohne Compose-Fenster
  ignoriert).
  (4) `saveMessage` schrieb drei .eml abgeschnitten (~7,9 MB, MIME-
  Schlussgrenze fehlt); dieselbe Mail später vollständig (15,2 MB) — der
  Inhalt war zum Poll-Zeitpunkt nicht vollständig lokal. Aufruferseitig
  abgefangen (dotfiles `4dfbcef`).
  (5) `searchMessages(countOnly)` meldete nach einem Löschen 13, die
  Listung im selben Moment 7.
- **Klasse:** Effekt im GUI ohne Rückkanal — das Werkzeug meldet Erfolg
  über einen Zustand, den es selbst nicht nachliest (Tab-Inhalt, Ordner
  nach Replace, Datei-Vollständigkeit).
- **Vorformulierter Fix (ein Release, in dieser Reihenfolge):**
  1. `listTabs` — je Tab: Index, Modus, angezeigte Nachricht (Message-ID,
     Ordner-URI, Betreff); live aus `tabmail.tabInfo`, nicht aus
     session.json.
  2. `closeTabs` — nach Tab-Index ODER nach Message-ID (alle Tabs, die
     diese Nachricht zeigen).
  3. `displayMessage` liest nach dem Öffnen die im Tab TATSÄCHLICH
     angezeigte Message-ID zurück und gibt sie aus; Abweichung = Fehler.
  4. `deleteMessages` und `saveDraft(replace)` schließen vorher die Tabs,
     die die betroffene Nachricht zeigen (sonst springt der Tab, Befund 1);
     optional dasselbe als Hook auf „gesendet" — das ist der Fall des
     Betreibers, der aus dem Tab heraus sendet.
  5. `editDraft` — Entwurf direkt im Compose-Fenster öffnen (Senden-Knopf
     sofort da, kein Lese-Tab + „Edit").
  6. `saveDraft(replace)` am Bestand reparieren: nach dem Speichern den
     Vorgänger im Ordner nachlesen; liegt er noch, löschen und das melden —
     nie „replaced" ohne Nachweis.
  7. `saveMessage`: vor dem Schreiben die Nachricht vollständig laden
     (Offline-Kopie erzwingen) und die geschriebene Datei auf die
     MIME-Schlussgrenze prüfen.
  8. `countOnly` gegen die frische Ordner-Datenbank zählen.
  Verifikation je Verb am echten Betterbird: rot-zuerst wo ein Test geht
  (`npm test`), dazu ein Live-Paar je GUI-Verb (Tab öffnen → `listTabs`
  zeigt die richtige ID; Entwurf löschen → Tab ist zu, nicht gesprungen).
- **Konsument/Drain:** Bau-Session an diesem Repo (Fork, Zweig von
  `feat/edit-draft`); Installation ist ein Betreiber-Schritt (Add-on
  entfernen → Neustart → XPI → Neustart) und die neuen Werkzeuge sieht
  erst eine NEUE Claude-Sitzung (CLAUDE.local.md). Drain: Eintrag schließt
  mit Commit-Ref je Punkt oder Verwurf mit Ein-Zeilen-Grund.
