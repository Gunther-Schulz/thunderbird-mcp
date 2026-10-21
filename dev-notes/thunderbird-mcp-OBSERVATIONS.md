# thunderbird-mcp — Instrument-Beobachtungen

(Form: Vorfall + Basis · Klasse · vorformulierter Fix · Konsument/Drain —
Slot-Muster dispatch-guards `dev-notes/OBSERVATIONS-FORM.md`. Drain per
Backlog-Retirement-Quote.)

## 2026-08-19 — rawSource als .eml-Ersatz flutet den Agent-Kontext; das richtige Verb (saveMessage) ist gated und für Sessions unsichtbar

- **Disposition: DONE 2026-10-21.** (a) settled in practice: pbs-mail-poll
  starts its own bridge with THUNDERBIRD_MCP_SAVE_MESSAGE=1 and a SAVE_ROOT
  on its intake tree (dotfiles bootstrap/pbs-mail-poll.py, bridge env);
  interactive sessions stay gated. (b) built: the rawSource descriptions of
  getMessage/getMessages point to saveMessage -- fork main `4a4f53f`, upstream
  in #184 (`6bbd322`).

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

- **Disposition: DONE 2026-10-21.** Built as proposed: rows of
  searchMessages and getRecentMessages show the first 3 addresses plus
  "(+N more)", fullRecipients: true for the full lists, getMessage unchanged
  -- upstream PR #260 (`78fd67d`), merged into fork main.

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
  Nachbar-Entwurf (Betreiber-Screenshot); sauber wiederholt mit allen
  Tabs geschlossen (Probe 2, gleicher Ausgang). Reichweite gemessen: NUR
  der Tab der gelöschten Nachricht springt — zwei Test-Entwürfe A/B je im
  eigenen Tab, A gelöscht, Tab B zeigte weiter B (Betreiber-Sicht).
  URSACHE + ABHILFE gefunden: Betterbird-Pref
  `mail.close_message_window.on_delete` (Default false; mailCommon.js wählt
  damit zwischen closeTab und Nachbar-Auswahl). Gesetzt über dotfiles
  `betterbird/user.js` (`6dfd707`); nach Neustart Probe 4: Entwurf gelöscht
  → Tab schließt sich (Betreiber-Sicht, Ausgang vorab benannt). Punkt 4
  des Fixes ist damit Sicherheitsnetz für Profile ohne diese Pref. Davor zweimal im Echtbetrieb: der
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
- **Build status (2026-10-21, session_01N4YYTxL1NtXzteY3VpHBLZ):** built on
  `feat/gui-backchannel`, base upstream v0.9.3 -- NOT `feat/edit-draft`: the
  running add-on was upstream 0.9.2 (auto-updated 2026-10-02, api.js identical
  to tag v0.9.2) and #194 is merged upstream, so that base would have
  downgraded 136 commits. Every point red-first against upstream code.
  1-3 listTabs / closeTabs / displayMessage read-back: `889fbcc`.
  4 views closed before delete: `889fbcc`; before saveDraft replace: `c2db49e`.
  The optional send hook is NOT built: the profile pref
  `mail.close_message_window.on_delete` (dotfiles `6dfd707`, Probe 4) closes
  the tab on send/delete already; a global send observer for a case closed by
  configuration is not worth its surface.
  5 editDraft: `e882361`. 6 replace proven in Drafts: `c2db49e`.
  7 complete raw source: extension `b16ba4e` (IMAP without Offline flag
  streams from the server), bridge `3615872` (closing MIME boundary checked
  before writing, size read back); saveMessage carried over from
  feat/save-message as `4277523`, `f101aef`, test loader fix `8390fda`.
  8 countOnly = listing, scoped search waits for folder sync: `5913b9f`.
  Fresh-context review (opus, on 3615872): 5 claim-wider-than-effect defects
  and 2 bridge timeouts shorter than the extension's waits, fixed in
  `6df2a91` (replace proof: no-Trash path, unreadable DB, failed sync),
  `c37354c` (closeTabs mail tabs only; displayMessage "holds", not "shows"),
  `eb1ea68` (bridge timeouts 150/210 s; early closing boundary refused).
  Residual, inferred: Thunderbird's own removal of the old draft may still be
  in flight when the replace check starts -- worst case a duplicate in Trash.
  LIVE (2026-10-21, Betterbird 153.3.0esr-bb9, Kasserver IMAP, test drafts
  `LIVE-120037 *` only, via `scripts/tb-rpc.cjs`): 1-5 and 8 pass -- listTabs
  shows the operator's tabs; displayMessage read-back returns the requested
  id; closeTabs(messageId) closed only the test tab; editDraft opened the
  compose window and a repeat only focused it; deleteMessages closed the
  test tab (gone, no tab left on another id) and count = listing at once
  (152 -> 151). 6 first FAILED honestly: Thunderbird does NOT remove the
  replaced draft on this account (2 of 2), and the check's single 15 s sync
  was never answered -- update requests within ~10 s after a save are
  dropped (probe: t+0 s and t+5 s unanswered, t+10 s answered in 0.04 s).
  Fixed in `2cef933` (sync re-issued every 3 s for up to 30 s); re-run:
  confirmed sync, predecessor present, moved to Trash, verified gone,
  "Draft replaced" in 3.2 s. Drafts back to the pre-test total (183).
  UPSTREAM PRs (2026-10-21, split from the fork work, each red-first and
  suite-green on upstream v0.9.3): #256 listTabs/closeTabs/editDraft/
  displayMessage read-back (points 1-5); #257 countOnly + scoped sync
  (point 8); #258 complete raw source (point 7, extension); #259 verified
  draft replacement (point 6), stacked on #256 + #257; #184 saveMessage
  rebased per the maintainer's 2026-09-28 request, with the completeness
  check (point 7, bridge). Fork-only and never upstream: update_url removal
  `545519e`, dev-notes, scripts/tb-rpc.cjs, XPI builds.
  7 LIVE (bridge started like pbs-mail-poll, scratch SAVE_ROOT): the 15.2 MB
  incident message saved as emlCompleteness "verified", byte-identical to
  the poll's complete intake copy, Python parser: 6 parts, no defects. Its
  offline copy is complete by now, so the server-fetch branch of
  getMessage(rawSource) ran in mocks only -- an in-progress download cannot
  be produced on demand.

## 2026-10-21 -- deleteMessages reports success before an IMAP move to Trash has happened

- **Disposition: DROPPED 2026-10-21** -- not reproduced live on build
  `0d14dfe`: deleting one draft (152 -> 151) and three drafts in one call
  (151 -> 148) gave count = listing immediately, twice in a row. The two code
  causes of the original 13-vs-7 are fixed in `5913b9f`.

- **Incident + basis:** derived while fixing point 8 above (countOnly 13 vs
  listing 7 right after a delete), not measured. `deleteMessages` on a Drafts
  folder calls `MailServices.copy.copyMessages(..., isMove=true, listener=null)`
  and returns `{success, deleted}` at once (api.js `function deleteMessages`,
  upstream v0.9.3); on IMAP the move is asynchronous, so a search issued right
  after can still see the old rows. Inferred, unverified: whether this, the
  count/listing asymmetry fixed in `5913b9f`, or plain DB staleness produced
  the 13-vs-7.
- **Class:** effect without a back channel (same class as the entry above) --
  success reported from the submission, not from the folder.
- **Pre-formulated fix:** pass a copy listener, await `onStopCopy` (bounded
  timeout), then report `moveConfirmed: true|false`; never `deleted` without
  it. Discriminating live probe first: delete one test draft, then
  immediately `searchMessages(countOnly, folderPath=Drafts)` with the
  `5913b9f` build -- a count still including the draft indicts this path.
- **Consumer/drain:** the next build session on this repo, after the live
  pairs of the entry above; drain by commit ref or a one-line drop.

## 2026-10-21 -- saveDraft replace never confirms on the mail@guntherschulz.de account

- **Incident + basis:** session `session_016Bp6Z4wB2egdnrJwgbiHnp`, build
  installed as of 21.10. afternoon. `saveDraft` with `replaceMessageId` on
  account mail@guntherschulz.de (Drafts
  `imap://mail%40guntherschulz.de@w01c3d71.kasserver.com/Drafts`) returned
  `folderSyncConfirmed:false, replaceVerified:false, previousDraft:"present"`
  three times in a row (new ids f3954904…, 14e6f602…, fa4d33f7…); each time a
  Drafts listing showed BOTH drafts, and the predecessor had to be removed with
  `deleteMessages`. The same call on account mail@planungsbuero-schulz.de
  returned `replaceVerified:true, previousDraftMovedToTrash:true` four of four
  times the same day. The tool reported honestly -- no false success.
- **Class:** account-dependent folder sync; the replace path is only as good as
  the folder refresh it waits on.
- **Pre-formulated fix:** first a discriminating probe: compare the two
  accounts' Drafts folder flags and offline/sync settings (`folder.flags`,
  `server.offlineDownload`, `folder.getFlag(Ci.nsMsgFolderFlags.Offline)`);
  if the private account's Drafts is not offline-enabled, the refresh listener
  never fires. Then either refresh via `updateFolderWithListener` with a
  bounded retry, or, when the sync stays unconfirmed but the predecessor id is
  known and still listed, delete it by id inside the tool and report
  `previousDraftMovedToTrash` from that act.
- **Consumer/drain:** the next build session on this repo; drain by commit ref
  or a one-line drop.
