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

hilfe() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  echo
  echo "Aufgaben: befehle | controltypen | varfelder | slots"
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --aufgabe) AUFGABE="$2"; shift 2 ;;
    --quelle)  QUELLE="$2";  shift 2 ;;
    --host)    HOST="$2";    shift 2 ;;
    --modell)  MODELL="$2";  shift 2 ;;
    --ziel)    ZIEL="$2";    shift 2 ;;
    --trocken) TROCKEN=1;    shift ;;
    -h|--help) hilfe 0 ;;
    *) echo "Unbekannt: $1" >&2; hilfe 1 ;;
  esac
done

[ -n "$AUFGABE" ] || { echo "FEHLER: --aufgabe fehlt" >&2; hilfe 1; }
[ -n "$QUELLE" ]  || { echo "FEHLER: --quelle fehlt" >&2; hilfe 1; }
[ -d "$QUELLE" ]  || { echo "FEHLER: $QUELLE ist kein Verzeichnis" >&2; exit 1; }
command -v jq >/dev/null || { echo "FEHLER: jq fehlt (Debian/Ubuntu: sudo apt install jq)" >&2; exit 1; }

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
mapfile -t DATEIEN < <(grep -rlE "$MUSTER" "$QUELLE" --include='*.php' 2>/dev/null | sort)
[ "${#DATEIEN[@]}" -gt 0 ] || { echo "Keine Treffer — stimmt --quelle?" >&2; exit 1; }
echo "Dateien mit Treffern: ${#DATEIEN[@]}" >&2

ARBEIT="$(mktemp -d)"
trap 'rm -rf "$ARBEIT"' EXIT

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
frage_modell() {                        # $1 = Prompt-Datei -> Antwort auf stdout
  jq -Rs --arg m "$MODELL" \
     '{model:$m, prompt:., stream:false, options:{temperature:0, num_ctx:16384}}' \
     < "$1" \
  | curl -sS -X POST "$HOST/api/generate" \
         -H 'content-type: application/json' --data-binary @- \
  | jq -r 'if .error then ("Modell meldet: " + .error | halt_error(1)) else .response end' \
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
for stueck in "$ARBEIT"/[0-9]*.txt; do
  i=$((i + 1))
  printf 'Ausschnitt %d/%d …' "$i" "$anzahl" >&2
  {
    echo "$REGELN"; echo
    echo "AUFGABE"; echo "$FRAGE"; echo
    echo "AUSSCHNITT AUS DEM QUELLBAUM"; echo '```'; cat "$stueck"; echo '```'
  } > "$ARBEIT/prompt.txt"
  if antwort=$(frage_modell "$ARBEIT/prompt.txt"); then
    if [ "${antwort//[[:space:]]/}" = "KEINBEFUND" ]; then
      echo " ohne Befund" >&2
    else
      { echo "$antwort"; echo; } >> "$BEFUNDE"
      echo " ok" >&2
    fi
  else
    echo " FEHLER (uebersprungen)" >&2
  fi
done

[ -s "$BEFUNDE" ] || { echo "Kein einziger Befund — Muster oder Modell pruefen." >&2; exit 1; }

# ---- Zusammenfuehren ---------------------------------------------------------
echo "Fuehre Teilergebnisse zusammen …" >&2
{
  echo "$REGELN"; echo
  echo 'AUFGABE'
  echo 'Unten stehen Teilergebnisse, die aus einzelnen Ausschnitten desselben'
  echo 'Systems gewonnen wurden. Fuehre sie zu EINER Tabelle zusammen:'
  echo '- Doppelte Eintraege verschmelzen, nicht wiederholen.'
  echo '- Widersprechen sich zwei Teilergebnisse, nimm den Eintrag auf und'
  echo '  setze seine Sicherheit auf unklar mit einem Wort zur Abweichung.'
  echo '- Erfinde nichts hinzu, was in keinem Teilergebnis steht.'
  echo
  echo "TEILERGEBNISSE"; cat "$BEFUNDE"
} > "$ARBEIT/merge.txt"

mkdir -p "$(dirname "$ZIEL")"
frage_modell "$ARBEIT/merge.txt" > "$ZIEL"

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
