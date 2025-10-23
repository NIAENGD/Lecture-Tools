const translation = {
  "navigation": {
    "home": "Inicio",
    "catalog": "Catálogo",
    "tasks": "Tareas",
    "storage": "Almacenamiento",
    "system": "Sistema",
    "importExport": "Importar / Exportar",
    "debug": "Depurar"
  },
  "actions": {
    "create": "Crear",
    "bulkUpload": "Carga masiva",
    "bulkDownload": "Descarga masiva",
    "addToCart": "Agregar al carrito",
    "runCart": "Ejecutar carrito",
    "export": "Exportar",
    "import": "Importar",
    "purge": "Purgar",
    "systemUpdate": "Actualizar sistema",
    "debugToggle": "Depurar activado/desactivado",
    "uploadRecording": "Subir grabación",
    "uploadSlides": "Subir diapositivas",
    "createLecture": "Crear clase",
    "addSelectionToCart": "Agregar selección al carrito"
  },
  "actionDescriptions": {
    "create": "Crear una nueva clase en el lugar",
    "bulkUpload": "Cargue grabaciones o diapositivas en masa",
    "bulkDownload": "Prepare un archivo comprimido para las selecciones",
    "addToCart": "Agregar selección actual al carrito",
    "runCart": "Ejecutar las acciones en cola del carrito",
    "export": "Preparar paquete de exportación para descarga",
    "import": "Combinar o reemplazar desde un archivo",
    "purge": "Mantenga para purgar audio procesado",
    "systemUpdate": "Mantenga para programar actualización",
    "debugToggle": "Mostrar u ocultar el panel de depuración"
  },
  "layout": {
    "searchPlaceholder": "Buscar en todo",
    "searchLabel": "Búsqueda global",
    "statusTimeline": "Cronología de estado",
    "languageToggle": "Cambiar idioma",
    "themeToggle": "Cambiar tema",
    "cpuTooltip": "Carga de CPU",
    "tasksTooltip": "Tareas activas",
    "storageTooltip": "Uso de almacenamiento",
    "taskBadge": "{{value}} tareas",
    "storageBadge": "{{percent}} usado",
    "commandHint": "Presione para abrir la búsqueda",
    "searchEmptyHint": "Escriba para buscar en todo el espacio de trabajo.",
    "searchNoMatches": "Aún no hay coincidencias.",
    "notificationsRegion": "Notificaciones (F8)",
    "dismiss": "Cerrar",
    "openTasks": "Abrir tareas",
    "helpLabel": "Ayuda",
    "openHelp": "Mostrar tour de interfaz"
  },
  "helpOverlay": {
    "title": "Recorrido de la interfaz",
    "subtitle": "Cada zona accionable está resaltada. Toca para conocer más.",
    "close": "Cerrar recorrido",
    "visibleActions": "Todas las funciones permanecen visibles",
    "pressHoldHint": "Mantener pulsado protege las acciones destructivas",
    "remember": "No mostrar automáticamente",
    "dismiss": "Entendido",
    "topBar": {
      "title": "Barra superior",
      "body": "Busca globalmente, supervisa estado, cambia idioma, tema y abre la ayuda."
    },
    "megaRail": {
      "title": "Mega rail",
      "body": "Accede directo a Inicio, Catálogo, Tareas, Almacenamiento, Sistema, Importar/Exportar o Depurar."
    },
    "actionDock": {
      "title": "Dock de acciones",
      "body": "Operaciones masivas, control del carrito, importar/exportar, purgar y actualizar sistema en un toque."
    },
    "timeline": {
      "title": "Cronología de estado",
      "body": "Las tareas en vivo, retrocesos de GPU y finalizaciones se agrupan en este flujo horizontal."
    },
    "workCanvas": {
      "title": "Lienzo de trabajo",
      "body": "Diseño de tres paneles con plan de estudios, detalles y recursos siempre visibles."
    },
    "catalogPaneA": {
      "title": "Árbol del plan de estudios",
      "body": "Busca, selecciona múltiples y arrastra para reordenar clases, módulos y lecciones."
    },
    "catalogPaneB": {
      "title": "Detalles y editor",
      "body": "Consulta metadatos, activa edición en línea y gestiona cambios masivos."
    },
    "catalogPaneC": {
      "title": "Recursos y acciones",
      "body": "Sube, descarga, transcribe, procesa diapositivas y envía al carrito."
    },
    "taskCart": {
      "title": "Carrito de tareas",
      "body": "Cola, reordena, ejecuta pruebas y guarda presets para automatizaciones."
    },
    "home": {
      "title": "Control de misión",
      "body": "Accesos rápidos a las cargas y acciones más frecuentes."
    },
    "homeActivity": {
      "title": "Actividad reciente",
      "body": "Revisa y vuelve a abrir las últimas operaciones con un toque."
    },
    "homeSnapshot": {
      "title": "Instantánea del sistema",
      "body": "Comprueba GPU, uso de almacenamiento y tareas en cola de un vistazo."
    }
  },
  "home": {
    "title": "Centro de mando",
    "subtitle": "Inicie cargas, supervise operaciones y mantenga todo a dos toques.",
    "quickActionsTitle": "Acciones rápidas",
    "quickTileDescriptions": {
      "uploadRecording": "Masterice y transcriba automáticamente.",
      "uploadSlides": "Procese presentaciones en notas buscables.",
      "createLecture": "Agregue metadatos y organice módulos.",
      "addSelectionToCart": "Encole ejecuciones en modo paz.",
      "runCart": "Ejecute las automatizaciones en cola ahora."
    },
    "recentActivityTitle": "Actividad reciente",
    "recentActivitySubtitle": "Revise las últimas operaciones y ábralas con un toque.",
    "systemSnapshot": "Instantánea del sistema",
    "metrics": {
      "gpu": "Compatibilidad GPU",
      "storage": "Almacenamiento utilizado",
      "queued": "Tareas en cola",
      "gpuActive": "Activa",
      "gpuFallback": "Modo degradado"
    },
    "open": "Abrir"
  },
  "auth": {
    "accessDeniedTitle": "Acceso denegado",
    "accessDeniedBody": "Necesita el permiso {{roles}} para completar esta acción."
  },
  "feedback": {
    "createQueued": {
      "title": "Crear clase",
      "body": "Editor en línea abierto en Catálogo."
    },
    "bulkUpload": {
      "title": "Carga masiva lista",
      "body": "Suelte archivos o carpetas para iniciar."
    },
    "bulkDownload": {
      "title": "Constructor de exportación",
      "body": "Selecciones preparadas en Importar/Exportar."
    },
    "addToCart": {
      "title": "Carrito de tareas",
      "body": "Selección añadida. Revise antes de ejecutar."
    },
    "runCartEmpty": {
      "title": "Carrito vacío",
      "body": "Agregue al menos una tarea antes de ejecutar."
    },
    "runCart": {
      "title": "Carrito en ejecución",
      "body": "Supervisión desde la vista de Tareas."
    },
    "export": {
      "title": "Exportación preparada",
      "body": "Archivo en cola en Importar/Exportar."
    },
    "import": {
      "title": "Importación lista",
      "body": "Elija el archivo para revisar antes de confirmar."
    },
    "purge": {
      "title": "Purgado masivo iniciado",
      "body": "Candidatos bloqueados con deshacer de 10 s."
    },
    "systemUpdate": {
      "title": "Actualización del sistema",
      "body": "Actualización en cola. Controles bloqueados durante la aplicación."
    },
    "debug": {
      "title": "Modo depuración",
      "body": "Consola de depuración alternada."
    }
  }
} as const;

export default translation;
