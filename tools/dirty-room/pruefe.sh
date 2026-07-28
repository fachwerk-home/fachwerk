#!/usr/bin/env bash
# Ergebnis einer Dirty-Room-Extraktion auf Codereste absuchen.
#
# Meldet, WO etwas nach Quelltext aussieht — nie, WAS dort steht. Damit kann
# der Betreiber die Stellen selbst ansehen und bereinigen, ohne dass der
# Inhalt auf dem Weg dorthin in fremde Haende geraet. Genau darum geht es bei
# der Clean-Room-Trennung.
#
#   ./pruefe.sh _ingest/visu-befehle.md
#
# Rueckgabe: 0 wenn sauber, 1 wenn etwas zu pruefen ist.
set -euo pipefail

DATEI="${1:-}"
[ -n "$DATEI" ] || { echo "Aufruf: ./pruefe.sh <ergebnis.md>" >&2; exit 2; }
[ -f "$DATEI" ] || { echo "FEHLER: $DATEI nicht gefunden" >&2; exit 2; }

# Muster, die auf Quelltext statt auf Beschreibung hindeuten. Bewusst
# grosszuegig: ein Fehlalarm kostet einen Blick, eine uebersehene Codezeile
# kostet die Trennung.
melde() {                               # $1 = Bezeichnung, $2 = Muster
  local zeilen
  zeilen=$(grep -nE "$2" "$DATEI" 2>/dev/null | cut -d: -f1 | tr '\n' ' ' || true)
  [ -n "$zeilen" ] || return 0
  local anzahl; anzahl=$(printf '%s' "$zeilen" | wc -w)
  printf '  %-34s %3d  Zeile(n): %s\n' "$1" "$anzahl" "$zeilen"
  return 1
}

echo "Pruefe $DATEI auf Codereste …"
echo
befund=0

melde "PHP-Variable (\$name)"          '\$[a-zA-Z_][a-zA-Z0-9_]*'        || befund=1
melde "Array-Zugriff [...]"            '\[[[:space:]]*[\x27"][^]]*[\x27"][[:space:]]*\]' || befund=1
melde "Pfeil-/Bereichsoperator"        '(->|=>|::)'                      || befund=1
melde "Schluesselwort function/return" '\b(function|return|foreach|elseif)\b' || befund=1
melde "Kontrollfluss if/switch/case"   '\b(if|switch|case|while|for)[[:space:]]*\(' || befund=1
melde "Anweisungsende mit Semikolon"   ';[[:space:]]*$'                  || befund=1
melde "Geschweifte Klammern"           '[{}]'                            || befund=1
melde "PHP-/Skript-Marker"             '(<\?php|<script|=== |!== )'      || befund=1
melde "eingerueckter Codeblock"        '^[[:space:]]{4,}[a-zA-Z_$(]'     || befund=1

echo
if [ "$befund" -eq 0 ]; then
  echo "SAUBER: keine Codereste gefunden."
  echo "Namen von Tabellen, Spalten und Funktionen sind erlaubt und werden hier"
  echo "nicht bemaengelt — sie sind Fundstellen, kein Quelltext."
  exit 0
fi

cat <<'HINWEIS'
ZU PRUEFEN: die Zeilen oben sehen nach Quelltext aus.

Schau sie dir an und entscheide je Zeile:
  - beschreibt sie, WAS passiert?      -> behalten, ggf. in Prosa umschreiben
  - zeigt sie, WIE es geschrieben ist? -> loeschen

Fehlalarme sind eingeplant: geschweifte Klammern stehen auch mal in einer
Beschreibung. Lieber einmal zu viel hinsehen.

Und ein Funktionsname als Fundstelle ("ausgewertet in visu_getElementStyleCss")
ist unbedenklich — fuer den Importer aber wertlos. Was zaehlt, ist das
Verhalten. Im Zweifel streichen: der Nutzen ist null, das Risiko nicht.
HINWEIS
exit 1
