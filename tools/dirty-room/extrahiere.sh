#!/usr/bin/env bash
# Dirty-Room-Extraktion mit einem LOKALEN Modell (Ollama).
#
# Zweck ist die Clean-Room-Trennung: dieses Skript liest den Quellcode der
# Altanlage und erzeugt daraus eine Beschreibung des VERHALTENS. Nur diese
# Beschreibung wird weitergegeben. Wer den Importer schreibt, sieht den
# Quellcode nie — die Trennung wird dadurch mechanisch statt eine Frage der
# Disziplin.
#
# Es laeuft auf DEINER Maschine und spricht ausschliesslich mit DEINEM
# Ollama-Host. Es schickt nichts sonstwohin.
#
# Aufruf (Windows/Git-Bash — Laufwerke werden als /c/... geschrieben,
# "C:/Quellen/altanlage" geht auch, "C:\Quellen\..." nicht):
#   ./extrahiere.sh --aufgabe befehle --quelle /c/Quellen/altanlage \
#                   --host http://192.168.0.24:11434 --modell devstral:latest
#
# Erst schauen, was verschickt wuerde — das kostet nichts:
#   ./extrahiere.sh --aufgabe befehle --quelle /c/Quellen/altanlage --trocken
set -euo pipefail

HOST="${OLLAMA_HOST:-http://localhost:11434}"
# devstral hat sich in einer Probe als einziges Modell getraut, einen nicht
# ermittelbaren Fall als "unklar" zu kennzeichnen statt ihn zu beschoenigen —
# und es formuliert um, statt Quellkommentare woertlich zu uebernehmen.
MODELL="${OLLAMA_MODELL:-devstral:latest}"
QUELLE=""
AUFGABE=""
ZIEL=""
TROCKEN=0
# Zeilen Kontext um einen Treffer. Grosszuegig: ein abgeschnittener
# Fallunterscheidungsblock erzeugt eine lueckenhafte Liste, und die faellt
# spaeter niemandem auf.
KONTEXT="${KONTEXT:-120}"
# Obergrenze je Anfrage in Zeilen. Modelle mit kleinem Fenster schneiden
# STILL ab — lieber mehr Anfragen als stille Verluste.
MAX_ZEILEN="${MAX_ZEILEN:-600}"
# Welche Dateitypen durchsucht werden. NICHT nur PHP: eine Visu laeuft im
# Browser, und was beim Klick passiert, steht dann in JavaScript. Wer hier zu
# eng sucht, bekommt ein leeres Ergebnis und haelt es fuer eine Antwort.
ENDUNGEN="${ENDUNGEN:-php,js,inc,phtml,html}"
# Arbeitsverzeichnis nach dem Lauf aufheben (zur Fehlersuche).
BEHALTE=0

hilfe() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  echo
  echo "Aufgaben: befehle | controltypen | varfelder | slots"
  echo "Weitere Schalter: --endungen php,js  --behalte (Zwischenstaende aufheben)"
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --aufgabe) AUFGABE="$2"; shift 2 ;;
    --quelle)  QUELLE="$2";  shift 2 ;;
    --host)    HOST="$2";    shift 2 ;;
    --modell)  MODELL="$2";  shift 2 ;;
    --ziel)    ZIEL="$2";    shift 2 ;;
    --trocken)  TROCKEN=1;   shift ;;
    --behalte)  BEHALTE=1;   shift ;;
    --endungen) ENDUNGEN="$2"; shift 2 ;;
    -h|--help) hilfe 0 ;;
    *) echo "Unbekannt: $1" >&2; hilfe 1 ;;
  esac
done

[ -n "$AUFGABE" ] || { echo "FEHLER: --aufgabe fehlt" >&2; hilfe 1; }
[ -n "$QUELLE" ]  || { echo "FEHLER: --quelle fehlt" >&2; hilfe 1; }
[ -d "$QUELLE" ]  || { echo "FEHLER: $QUELLE ist kein Verzeichnis" >&2; exit 1; }
# JSON-Werkzeug bestimmen. jq ist auf Linux ueblich, in der Git-Bash unter
# Windows aber nicht vorhanden — dort ist Python da. Statt eines der beiden
# vorauszusetzen, nimmt das Skript, was es findet. Achtung: unter Windows
# EXISTIERT "python3" als Platzhalter des Stores, laesst sich aber nicht
# ausfuehren — deshalb wird es zur Probe aufgerufen, nicht nur gesucht.
if command -v jq >/dev/null 2>&1; then
  JSON=jq
elif command -v python3 >/dev/null 2>&1 && python3 -c '' >/dev/null 2>&1; then
  JSON=python3
elif command -v python >/dev/null 2>&1 && python -c '' >/dev/null 2>&1; then
  JSON=python
else
  echo "FEHLER: weder jq noch Python gefunden." >&2
  echo "  Debian/Ubuntu: sudo apt install jq" >&2
  echo "  Windows:       winget install jqlang.jq   (oder Python installieren)" >&2
  exit 1
fi

# ---- Aufgabendefinition ------------------------------------------------------
# MUSTER  = wonach im Quellbaum gesucht wird (erweiterter regulaerer Ausdruck)
# FRAGE   = was das Modell aus den Fundstellen herausschreiben soll
# PRUEFE  = Werte, die im Ergebnis vorkommen MUESSEN (Vollstaendigkeitsprobe)
case "$AUFGABE" in
  befehle)
    MUSTER='cmdid1|cmdoption1|cmdvalue1|visuCmdList'
    PRUEFE='2 4 6'
    FRAGE='Erfasse ALLE Befehlsarten der Tabelle editVisuCmdList (Spalten: cmd,
cmdid1, cmdid2, cmdoption1, cmdoption2, cmdvalue1, cmdvalue2).
Fuer JEDEN moeglichen Wert von cmd: Nummer, Bezeichnung, Wirkung beim Bedienen,
und die Belegung JEDER der sechs Spalten fuer genau diesen cmd (Bedeutung,
Datentyp, und worauf eine id zeigt: Zieltabelle und Spalte). Nenne auch, welche
Spalten bei diesem cmd unbenutzt bleiben.'
    ;;
  controltypen)
    MUSTER='controltyp'
    PRUEFE='0 1 12 15 21'
    FRAGE='Erfasse ALLE Elementtypen (controltyp), die das System kennt.
Je Typ: Nummer, Bezeichnung, Zweck in einem Satz, was der Bediener sieht und
tun kann, welche KO-Felder benutzt werden (gaid=KO1, gaid2=KO2, gaid3=KO3) und
wofuer, welche var-Felder ausgewertet werden (nur die Nummern), und ob der Typ
interaktiv ist oder reine Anzeige. Nenne ausserdem, woran man ein
mitgeliefertes Element von einem nachtraeglich installierten unterscheidet.'
    ;;
  varfelder)
    MUSTER='var1[0-9]|var[1-9]'
    PRUEFE='var3 var11 var15'
    FRAGE='Die Tabelle editVisuElement hat generische Felder var1..var20, deren
Bedeutung vom controltyp abhaengt. Erfasse je controltyp, welche var-Felder
ausgewertet werden, und je Feld: Bedeutung, Datentyp und Wertebereich (bei
Aufzaehlungen ALLE Werte, bei Bitmasken jedes Bit einzeln) sowie das Verhalten
bei leerem Feld. Beginne mit controltyp 1.'
    ;;
  slots)
    MUSTER='styletyp|\bs4[0-8]\b|\bs[1-9]\b'
    PRUEFE='s16 s17 s18 s32'
    FRAGE='Erfasse die Kodierung der Design-Slots s1..s48. Fuer JEDEN Slot mit
fester Werteliste (u. a. Schriftstil, Schriftstaerke, Textausrichtung,
Rahmenstil, Schattenrichtung): ALLE gueltigen Werte mit Bedeutung. Fuer jeden
Slot, der auf eine Tabelle zeigt: Zieltabelle und die Spalte mit dem Nutzwert.
Ausserdem: was gilt, wenn bei bedingten Designs (styletyp 1) MEHRERE
Bedingungen zugleich zutreffen?'
    ;;
  *) echo "FEHLER: unbekannte Aufgabe: $AUFGABE" >&2; hilfe 1 ;;
esac

ZIEL="${ZIEL:-_ingest/$AUFGABE.md}"

REGELN='HARTE REGELN

1. Deine Antwort enthaelt KEINEN Quellcode und kein Zitat daraus. Beschreibe
   ausschliesslich VERHALTEN und die Bedeutung von Feldern. Datei- und
   Funktionsnamen als Fundstelle zu nennen ist erlaubt.
2. VOLLSTAENDIGKEIT vor Kuerze: gesucht ist, was das System DEFINIERT, nicht
   was eine bestimmte Anlage benutzt.
3. Jede Zeile bekommt eine Spalte Sicherheit mit genau einem Wert:
   sicher | plausibel | unklar.
   Eine als sicher markierte Falschaussage ist der teuerste Fehler ueberhaupt -
   daraus entsteht ein Importer, der schweigend falsch arbeitet. Lieber zehn
   unklar als ein falsches sicher.
4. Antworte als Markdown-Tabelle. Deutsch. Keine Einleitung, kein Fazit.
5. Steht im vorgelegten Ausschnitt nichts zur Frage, antworte mit genau:
   KEIN BEFUND'

# ---- Fundstellen sammeln -----------------------------------------------------
echo "Suche in $QUELLE nach: $MUSTER" >&2
IFS=',' read -ra _endungen <<< "$ENDUNGEN"
INCL=(); for _e in "${_endungen[@]}"; do INCL+=(--include="*.${_e}"); done
echo "Dateitypen: $ENDUNGEN" >&2
mapfile -t DATEIEN < <(grep -rlE "$MUSTER" "$QUELLE" "${INCL[@]}" 2>/dev/null | sort)
[ "${#DATEIEN[@]}" -gt 0 ] || { echo "Keine Treffer — stimmt --quelle?" >&2; exit 1; }
echo "Dateien mit Treffern: ${#DATEIEN[@]}" >&2

ARBEIT="$(mktemp -d)"
aufraeumen() {
  if [ "$BEHALTE" -eq 1 ]; then
    echo "Zwischenstaende liegen in: $ARBEIT" >&2
  else
    rm -rf "$ARBEIT"
  fi
}
trap aufraeumen EXIT

# Je Datei die Trefferzeilen zu Fenstern zusammenfassen (ueberlappende Bereiche
# verschmelzen), damit ein Fallunterscheidungsblock nicht mitten entzweigeht.
teil=0
for datei in "${DATEIEN[@]}"; do
  mapfile -t treffer < <(grep -nE "$MUSTER" "$datei" | cut -d: -f1)
  [ "${#treffer[@]}" -gt 0 ] || continue
  von=0; bis=0
  schreibe() {
    [ "$bis" -gt 0 ] || return 0
    teil=$((teil + 1))
    {
      echo "# Datei: ${datei#"$QUELLE"/} (Zeilen $von-$bis)"
      sed -n "${von},${bis}p" "$datei"
    } > "$ARBEIT/$(printf '%04d' "$teil").txt"
  }
  for zeile in "${treffer[@]}"; do
    n_von=$(( zeile - KONTEXT )); [ "$n_von" -lt 1 ] && n_von=1
    n_bis=$(( zeile + KONTEXT ))
    if [ "$bis" -gt 0 ] && [ "$n_von" -le "$bis" ] && [ $(( n_bis - von )) -le "$MAX_ZEILEN" ]; then
      bis=$n_bis                      # anschliessend -> Fenster erweitern
    else
      schreibe; von=$n_von; bis=$n_bis
    fi
  done
  schreibe
done

anzahl=$(find "$ARBEIT" -name '*.txt' | wc -l)
zeilen=$(cat "$ARBEIT"/*.txt 2>/dev/null | wc -l)
echo "Ausschnitte: $anzahl  (~$zeilen Zeilen gesamt)" >&2

if [ "$TROCKEN" -eq 1 ]; then
  echo
  echo "TROCKENLAUF — es wurde nichts verschickt."
  echo "Ausschnitte: $anzahl, Zeilen: $zeilen, Ziel waere: $ZIEL"
  echo "Modell: $MODELL auf $HOST"
  echo
  echo "Betroffene Dateien:"
  printf '  %s\n' "${DATEIEN[@]#"$QUELLE"/}"
  exit 0
fi

# ---- Ausschnitte einzeln vorlegen -------------------------------------------
baue_anfrage() {                        # $1 = Prompt-Datei -> JSON auf stdout
  if [ "$JSON" = jq ]; then
    jq -Rs --arg m "$MODELL" \
       '{model:$m, prompt:., stream:false, options:{temperature:0, num_ctx:16384}}' < "$1"
  else
    "$JSON" -c 'import json,sys
sys.stdin.reconfigure(encoding="utf-8")
print(json.dumps({"model": sys.argv[1], "prompt": sys.stdin.read(), "stream": False,
                  "options": {"temperature": 0, "num_ctx": 16384}}))' "$MODELL" < "$1"
  fi
}

lies_antwort() {                        # JSON auf stdin -> Text auf stdout
  if [ "$JSON" = jq ]; then
    jq -r 'if .error then ("Modell meldet: " + .error | halt_error(1)) else .response end'
  else
    "$JSON" -c 'import json,sys
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
try:
    d = json.load(sys.stdin)
except ValueError:
    sys.stderr.write("Antwort war kein JSON — laeuft dort wirklich Ollama?\n"); sys.exit(1)
if d.get("error"):
    sys.stderr.write("Modell meldet: " + d["error"] + "\n"); sys.exit(1)
sys.stdout.write(d.get("response", ""))'
  fi
}

frage_modell() {                        # $1 = Prompt-Datei -> Antwort auf stdout
  baue_anfrage "$1" \
  | curl -sS -X POST "$HOST/api/generate" \
         -H 'content-type: application/json' --data-binary @- \
  | lies_antwort \
  | saeubere
}

# Denkmodelle stellen ihre Ueberlegung voran, manche Modelle rahmen die Antwort
# in einen Codeblock. Beides gehoert nicht in eine Tabelle, die anschliessend
# gelesen und weitergegeben wird.
saeubere() {
  sed -e '/<think>/,/<\/think>/d' -e '/^[[:space:]]*```[a-zA-Z]*[[:space:]]*$/d'
}

BEFUNDE="$ARBEIT/befunde.md"
: > "$BEFUNDE"
i=0
mit_befund=0
for stueck in "$ARBEIT"/[0-9]*.txt; do
  i=$((i + 1))
  printf 'Ausschnitt %d/%d …' "$i" "$anzahl" >&2
  {
    echo "$REGELN"; echo
    echo "AUFGABE"; echo "$FRAGE"; echo
    echo "AUSSCHNITT AUS DEM QUELLBAUM"; echo '```'; cat "$stueck"; echo '```'
  } > "$ARBEIT/prompt.txt"
  if antwort=$(frage_modell "$ARBEIT/prompt.txt"); then
    # Manche Modelle haengen das Abbruchwort HINTER eine gefundene Tabelle.
    # Deshalb die Zeile entfernen und schauen, ob noch etwas uebrig bleibt —
    # sonst stuende sie mitten im Ergebnis.
    kern=$(printf '%s\n' "$antwort" | sed '/^[[:space:]]*KEIN BEFUND[[:space:]]*$/Id')
    if [ -z "${kern//[[:space:]]/}" ]; then
      echo " ohne Befund" >&2
    else
      { printf '%s\n' "$kern"; echo; } >> "$BEFUNDE"
      mit_befund=$((mit_befund + 1))
      echo " ok" >&2
    fi
  else
    echo " FEHLER (uebersprungen)" >&2
  fi
done

[ -s "$BEFUNDE" ] || { echo "Kein einziger Befund — Muster oder Modell pruefen." >&2; exit 1; }

# ---- Zusammenfuehren ---------------------------------------------------------
mkdir -p "$(dirname "$ZIEL")"
if [ "$mit_befund" -le 1 ]; then
  # Nur ein Ausschnitt hat etwas geliefert — es gibt nichts zu verschmelzen.
  # Ein Zusammenfuehr-Durchgang wuerde hier bloss dieselben Angaben in
  # mehreren Tabellen wiederholen (beobachtet).
  echo "Ein einzelner Befund — Zusammenfuehren entfaellt." >&2
  cp "$BEFUNDE" "$ZIEL"
else
  echo "Fuehre $mit_befund Teilergebnisse zusammen …" >&2
  {
    # BEWUSST NICHT die Regeln von oben: dort steht das Abbruchwort fuer den
    # Fall, dass ein Ausschnitt nichts hergibt. Auf die Teilergebnisse
    # angewandt macht es aus vorhandenen Befunden ein "keine Informationen
    # gefunden" — beobachtet, und es sieht aus wie eine Antwort.
    echo 'HARTE REGELN'
    echo '1. KEIN Quellcode und kein Zitat daraus. Nur Verhalten und'
    echo '   Feldbedeutungen.'
    echo '2. Jede Zeile behaelt ihre Spalte Sicherheit (sicher/plausibel/unklar).'
    echo '3. Deutsch, Markdown-Tabelle, keine Einleitung, kein Fazit.'
    echo '4. Unten STEHEN Befunde. Antworte niemals damit, dass nichts'
    echo '   gefunden wurde — deine Aufgabe ist allein das Zusammenfassen.'
    echo
    echo 'AUFGABE'
    echo 'Unten stehen Teilergebnisse aus einzelnen Ausschnitten desselben'
    echo 'Systems. Mache daraus GENAU EINE Tabelle:'
    echo '- Eine einzige Tabelle, keine zweite daneben. Wiederhole dieselben'
    echo '  Angaben NICHT noch einmal in anderer Aufteilung.'
    echo '- Je Eintrag genau eine Zeile; doppelte Eintraege verschmelzen.'
    echo '- Widersprechen sich zwei Teilergebnisse, nimm den Eintrag auf und'
    echo '  setze seine Sicherheit auf unklar mit einem Wort zur Abweichung.'
    echo '- Erfinde nichts hinzu, was in keinem Teilergebnis steht.'
    echo
    echo "TEILERGEBNISSE"; cat "$BEFUNDE"
  } > "$ARBEIT/merge.txt"
  frage_modell "$ARBEIT/merge.txt" > "$ZIEL"
  # Sicherheitsnetz: liefert die Zusammenfuehrung keine Tabelle, waren die
  # Teilergebnisse trotzdem da. Dann lieber die ungeschliffene Sammlung als
  # ein glattes "nichts gefunden", das man fuer eine Antwort haelt.
  if ! grep -q '|' "$ZIEL"; then
    echo "WARNUNG: Zusammenfuehrung ergab keine Tabelle — nehme die" >&2
    echo "         ungeschliffenen Teilergebnisse. Bitte selbst ordnen." >&2
    cp "$BEFUNDE" "$ZIEL"
  fi
fi

# ---- Vollstaendigkeitsprobe --------------------------------------------------
echo >&2
echo "Ergebnis: $ZIEL" >&2
fehlend=""
for wert in $PRUEFE; do
  grep -qw -- "$wert" "$ZIEL" || fehlend="$fehlend $wert"
done
if [ -n "$fehlend" ]; then
  echo "WARNUNG: bekannte Werte fehlen im Ergebnis:$fehlend" >&2
  echo "         Das Ergebnis ist unvollstaendig — groesseres Modell, mehr" >&2
  echo "         KONTEXT (jetzt $KONTEXT) oder hoeheres num_ctx versuchen." >&2
else
  echo "Vollstaendigkeitsprobe bestanden (gefunden:$(echo " $PRUEFE"))" >&2
fi
echo "Jetzt DU: durchlesen, alles mit Sicherheit=unklar pruefen oder streichen." >&2
