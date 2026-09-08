#!/usr/bin/env bash
#
# download.sh — устойчивый загрузчик видео Yodla по manifest.json
#
# Принцип:
#   • Читает manifest.json (получен через: node scraper.js --manifest --token "...")
#   • Для каждой записи качает curl-ом (curl доказал надёжность на этом сервере)
#   • Сверяет реальный размер файла с ожидаемым из манифеста
#   • Докачивает при обрыве (curl -C -), повторяет до 5 попыток
#   • Готовые (правильного размера) пропускает — можно перезапускать сколько угодно
#
# Запуск:
#   cd yodla-scraper
#   ./download.sh            # скачать всё
#   ./download.sh UZ         # только узбекские
#   ./download.sh RU         # только русские
#   ./download.sh 5          # только видео №5 (по полю index)
#
# Можно прервать (Ctrl+C) и запустить снова — продолжит с того же места.

set -u
cd "$(dirname "$0")"

MANIFEST="manifest.json"
if [ ! -f "$MANIFEST" ]; then
  echo "✗ Не найден $MANIFEST."
  echo "  Сначала создайте его: node scraper.js --manifest --token \"ВАШ_ТОКЕН\""
  exit 1
fi

FILTER_LANG="${1:-}"
FILTER_INDEX="${1:-}"

# Извлечь массив записей через node (jq может отсутствовать в системе)
read_records() {
  node -e '
    const m = require("./manifest.json");
    const recs = Array.isArray(m) ? m : (m.records || m.videos || []);
    for (const r of recs) {
      console.log(JSON.stringify(r));
    }
  '
}

echo "═══════════════════════════════════════════════════════════════"
echo "  Yodla загрузчик видео"
echo "═══════════════════════════════════════════════════════════════"
[ -n "$FILTER_LANG" ]   && echo "  Фильтр по языку:  $FILTER_LANG"
[ -n "$FILTER_INDEX" ]  && echo "  Фильтр по индексу: $FILTER_INDEX (если число — фильтр по index, иначе — по языку)"
echo ""

ok=0; skipped=0; failed=0
failed_list=()

while IFS= read -r line; do
  [ -z "$line" ] && continue

  # Парсим поля одной записи через node (защита от кавычек/спецсимволов в именах)
  eval "$(node -e '
    const r = JSON.parse(process.argv[1]);
    console.log("IDX=" + JSON.stringify(r.index));
    console.log("LANG=" + JSON.stringify(r.lang));
    console.log("TITLE=" + JSON.stringify(r.title));
    console.log("URL=" + JSON.stringify(r.url));
    console.log("SIZE=" + JSON.stringify(r.expectedSize || 0));
    console.log("OUT=" + JSON.stringify(r.outPath));
  ' "$line")"

  # Применяем фильтр
  if [ -n "$FILTER_LANG" ] && [ "$FILTER_LANG" = "$FILTER_INDEX" ]; then
    if [ "$FILTER_LANG" != "$LANG" ]; then continue; fi
  fi
  if [ -n "$FILTER_INDEX" ] && [ "$FILTER_INDEX" != "$FILTER_LANG" ]; then
    # числовой фильтр по index
    case "$FILTER_INDEX" in
      ''|*[!0-9]*) ;;  # не число — игнорируем
      *) [ "$FILTER_INDEX" != "$IDX" ] && continue ;;
    esac
  fi

  echo "[$IDX/88] ($LANG) $TITLE"

  # Если файл уже существует и размер совпадает — пропуск
  if [ -f "$OUT" ]; then
    cur_size=$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT" 2>/dev/null || echo 0)
    if [ "$SIZE" -gt 0 ] && [ "$cur_size" = "$SIZE" ]; then
      echo "  ✓ Уже скачан ($(echo "scale=1; $cur_size/1048576" | bc 2>/dev/null || echo "$((cur_size/1048576))") MB), пропуск"
      skipped=$((skipped + 1))
      continue
    fi
    echo "  → Докачиваю (есть $((cur_size/1048576)) MB из $((SIZE/1048576)) MB)"
  else
    mkdir -p "$(dirname "$OUT")"
  fi

  # Скачивание curl-ом с повторами
  attempt=0
  success=0
  while [ "$attempt" -lt 5 ]; do
    attempt=$((attempt + 1))
    echo "  → Попытка $attempt ..."
    if curl -L --fail \
        --retry 3 --retry-delay 2 --connect-timeout 30 --max-time 0 \
        -C - \
        -H "User-Agent: Mozilla/5.0" \
        -o "$OUT" \
        "$URL" 2>/dev/null; then
      # Проверяем размер
      cur_size=$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT" 2>/dev/null || echo 0)
      if [ "$SIZE" -gt 0 ] && [ "$cur_size" != "$SIZE" ]; then
        echo "  ⚠ Размер не совпадает: $cur_size из $SIZE, повтор..."
        continue
      fi
      mb=$(echo "scale=1; $cur_size/1048576" | bc 2>/dev/null || echo "$((cur_size/1048576))")
      echo "  ✓ Сохранено: $(basename "$OUT") ($mb MB)"
      success=1
      break
    else
      echo "  ⚠ curl не завершился успешно, повтор..."
      sleep 2
    fi
  done

  if [ "$success" = "1" ]; then
    ok=$((ok + 1))
  else
    failed=$((failed + 1))
    failed_list+=("[$IDX] $TITLE")
  fi
done < <(read_records)

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Готово. Скачано: $ok | Пропущено: $skipped | Ошибок: $failed"
echo "  Папка: videos/"
if [ "${#failed_list[@]}" -gt 0 ]; then
  echo ""
  echo "  Не удалось скачать:"
  for f in "${failed_list[@]}"; do echo "    - $f"; done
  echo ""
  echo "  Повторите запуск — докачает недостающие: ./download.sh"
fi
echo "═══════════════════════════════════════════════════════════════"
