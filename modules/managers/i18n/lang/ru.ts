export default {
  "commands": {
    "settings": {
      "unknown": "неизвестная настройка.",
      "not-null": "эта настройка не может быть удалена.",
      "set": "выставил `{0}` на `{1}`.",
      "current": "текущие настройки для этого сервера.",
      "no-value": "[нет значения]"
    },

    "feedback": {
      "fail": "не удалось отправить отзыв.",
      "success": "спасибо! ваш отзыв был отправлен на наш сервер."
    },

    "module": {
      "assigned": "поставил модуль {0}!",
      "destroy": "останавливаю модуль...",
      "switched": "сменил на модуль {0}!"
    },

    "no-issue-url": "отправляй проблемы напрямую к хосту.",

    "ping": {
      "pong": "понг!",
      "unit": "мс",
      "footer": "shard ID: {0}"
    },

    "uptime": {
      "secret": "мучаюсь уже {0}",
      "res": "работаю уже {0}",

      "units": [
        "мс",
        "сек",
        "мин",
        "ч",
        "д"
      ]
    },

    "corrupt": {
      "current-infrequency": "текущая нечастота: `{0}`.",

      "invalid-mode": "неверный режим. режимов доступно: `{0}`.",
      "current-mode": "текущий режим: `{0}`.",

      "current-rand-sample": "текущий rand sample: `{0}`.",

      "enabled": "коррупция включена. (громкость понижена до `{0}%` для избежания проблем со слухом.)",
      "disabled": "коррупция выключена."
    },

    "effect": {
      "add": "добавлен эффект `{0}`!",
      "clear": "эффекты очищены!",
      "remove": "удален эффект `{0}`!",
      "set": "выставил `{0}` на `{1}`!",

      "list-options": "список опций",
      "set-option": "выставить опцию",
      "get-option": "получить опцию",
      "effect-id": "ID эффекта: {0} ({1})",
      "available-effects": "доступные эффекты",
      "options-for": "опции для `{0}`",
      "effects": "эффекты"
    },

    "nothing-is-playing": "в данный момент ничего не играет.",
    "voice-leave": "еще услышимся.",
    "current-volume": "текущая громкость: `{0}`%.",
    "current-packet-loss": "текущая потеря пакетов: `{0}`%.",
    "current-bitrate": "текущий битрейт: `{0}`.",
    "skipped": "пропущено!",
    "play-sfx": "играю `{0}`.",
    "join-msg": "приф!",
    "url-or-file": "ты должен вставить URL или загрузить файл.",
    "query-not-found": "не найдено.",

    "queue": {
      "nothing": "в очереди сейчас пусто.",
      "remove": "удалено `{0}` из очереди!",
      "clear": "очередь очищена!",
      "paginator": "очередь - {0}"
    },

    "runtime-error": "ошибка среды выполнения!!",
    "argument-error": "аргументная ошибка.",
    "missing-required-parameter": "пропущен необходимый параметр."
  },

  "voice-check": {
    "bot-not-in-voice": "я не подключен.",
    "voice-not-init": "голос еще не инициализирован!",
    "member-not-in-voice": "ты не в голосовом канале.",
    "not-enough-perms-send-messages": "недостаточно прав для отправки сообщений в этот текстовый канал.",
    "not-enough-perms-speak": "недостаточно прав для разговора в этом голосовом канале.",
    "already-connected": "уже подключен к голосовому каналу на этом сервере.",
    "members-overflow": "достигнут лимит пользователей канала."
  },

  "effects-mgr": {
    "not-found": "указанный эффект не найден.",
    "stack-overflow": "слишком много эффектов!",
    "stack-underflow": "слишком мало эффектов!",
    "option-not-found": "указанная опция эффекта не найдена.",
    "value-undefined": "необходимо предоставить значение",
    "out-of-range": "дано значение вне диапозона `[{0}; {1}]`"
  },

  "queue": {
    "url-unsupported": "запрошенный URL не поддерживается.",
    "not-found": "указанный предмет не найден."
  },

  "corrupt-mode-not-allowed": "ты не можешь включить режим коррупции. (если ты хочешь рискнуть чужим и своим слухом, выстави опцию `allowCorrupt` на `true` и переподключи бота.)",
  "invalid-number": "предоставлено неверное цифровое значение.",
  "page": "страница {0}/{1}",

  "voice-modules": {
    "no-active": "нет модуля.",
    "not-found": "указанный модуль не найден. {0}"
  }
};