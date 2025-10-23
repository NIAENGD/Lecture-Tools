const translation = {
  "navigation": {
    "home": "Home",
    "catalog": "Catalog",
    "tasks": "Tasks",
    "storage": "Storage",
    "system": "System",
    "importExport": "Import / Export",
    "debug": "Debug"
  },
  "actions": {
    "create": "Create",
    "bulkUpload": "Bulk Upload",
    "bulkDownload": "Bulk Download",
    "addToCart": "Add to Cart",
    "runCart": "Run Cart",
    "export": "Export",
    "import": "Import",
    "purge": "Purge",
    "systemUpdate": "System Update",
    "debugToggle": "Debug On / Off",
    "uploadRecording": "Upload Recording",
    "uploadSlides": "Upload Slides",
    "createLecture": "Create Lecture",
    "addSelectionToCart": "Add Selection to Cart"
  },
  "actionDescriptions": {
    "create": "Create a new lecture in-place",
    "bulkUpload": "Upload recordings or slides in bulk",
    "bulkDownload": "Queue archive export for selections",
    "addToCart": "Add current selection to cart",
    "runCart": "Execute queued cart actions",
    "export": "Stage export package for download",
    "import": "Merge or replace from archive",
    "purge": "Long-press to purge processed audio",
    "systemUpdate": "Long-press to schedule update",
    "debugToggle": "Toggle debug stream visibility"
  },
  "layout": {
    "searchPlaceholder": "Search everything",
    "searchLabel": "Global search",
    "statusTimeline": "Status timeline",
    "languageToggle": "Switch language",
    "themeToggle": "Change theme",
    "cpuTooltip": "CPU Load",
    "tasksTooltip": "Active Tasks",
    "storageTooltip": "Storage usage",
    "taskBadge": "{{value}} tasks",
    "storageBadge": "{{percent}} used",
    "commandHint": "Press to open search",
    "searchEmptyHint": "Type to search the entire workspace.",
    "searchNoMatches": "No matches yet.",
    "notificationsRegion": "Notifications (F8)",
    "dismiss": "Dismiss",
    "openTasks": "Open Tasks",
    "helpLabel": "Help",
    "openHelp": "Show interface tour"
  },
  "helpOverlay": {
    "title": "Interface tour",
    "subtitle": "Every actionable region is highlighted. Tap to learn more.",
    "close": "Close overlay",
    "visibleActions": "All functions stay visible",
    "pressHoldHint": "Press-and-hold protects destructive actions",
    "remember": "Don’t show automatically",
    "dismiss": "Got it",
    "topBar": {
      "title": "Top bar",
      "body": "Search globally, monitor status, switch language, theme, and open help."
    },
    "megaRail": {
      "title": "Mega-rail",
      "body": "Jump directly to Home, Catalog, Tasks, Storage, System, Import/Export, or Debug."
    },
    "actionDock": {
      "title": "Action dock",
      "body": "One-tap bulk operations, cart controls, import/export, purge, and system update."
    },
    "timeline": {
      "title": "Status timeline",
      "body": "Live tasks, GPU fallbacks, and completions collapse into this horizontal stream."
    },
    "workCanvas": {
      "title": "Work canvas",
      "body": "Tri-pane layout keeps curriculum, details, and assets visible simultaneously."
    },
    "catalogPaneA": {
      "title": "Curriculum tree",
      "body": "Search, multi-select, and drag to reorder classes, modules, and lectures."
    },
    "catalogPaneB": {
      "title": "Details & editor",
      "body": "Inspect metadata, toggle inline edit, and manage bulk updates."
    },
    "catalogPaneC": {
      "title": "Assets & actions",
      "body": "Upload, download, transcribe, process slides, and queue cart runs."
    },
    "taskCart": {
      "title": "Task cart",
      "body": "Queue, reorder, dry run, and save presets for batch automation."
    },
    "home": {
      "title": "Mission control",
      "body": "Quick tiles surface the most common uploads and cart actions."
    },
    "homeActivity": {
      "title": "Recent activity",
      "body": "Review and reopen the latest operations in a single tap."
    },
    "homeSnapshot": {
      "title": "System snapshot",
      "body": "Check GPU availability, storage usage, and queued cart items at a glance."
    }
  },
  "home": {
    "title": "Mission Control",
    "subtitle": "Launch uploads, monitor operations, and stay two taps from every task.",
    "quickActionsTitle": "Quick actions",
    "quickTileDescriptions": {
      "uploadRecording": "Master and transcribe automatically.",
      "uploadSlides": "Process decks into searchable notes.",
      "createLecture": "Add metadata and organize modules.",
      "addSelectionToCart": "Queue for peace-mode runs.",
      "runCart": "Execute queued automations now."
    },
    "recentActivityTitle": "Recent Activity",
    "recentActivitySubtitle": "Review last operations with single tap open.",
    "systemSnapshot": "System Snapshot",
    "metrics": {
      "gpu": "GPU Support",
      "storage": "Storage Used",
      "queued": "Queued Tasks",
      "gpuActive": "Active",
      "gpuFallback": "Fallback"
    },
    "open": "Open"
  },
  "auth": {
    "accessDeniedTitle": "Access denied",
    "accessDeniedBody": "You require {{roles}} permission to complete this action."
  },
  "feedback": {
    "createQueued": {
      "title": "Create lecture",
      "body": "Inline editor opened in Catalog."
    },
    "bulkUpload": {
      "title": "Bulk upload ready",
      "body": "Drop files or folders to begin."
    },
    "bulkDownload": {
      "title": "Export builder",
      "body": "Selections staged in Import/Export."
    },
    "addToCart": {
      "title": "Task cart",
      "body": "Selection added. Review before running."
    },
    "runCartEmpty": {
      "title": "Cart empty",
      "body": "Add at least one task before running."
    },
    "runCart": {
      "title": "Cart running",
      "body": "Monitoring from Tasks view."
    },
    "export": {
      "title": "Export staged",
      "body": "Archive job queued in Import/Export."
    },
    "import": {
      "title": "Import ready",
      "body": "Choose archive to inspect before commit."
    },
    "purge": {
      "title": "Bulk purge initiated",
      "body": "Candidates locked with 10s undo."
    },
    "systemUpdate": {
      "title": "System update",
      "body": "Update queued. Controls locked during apply."
    },
    "debug": {
      "title": "Debug mode",
      "body": "Debug console toggled."
    }
  }
} as const;

export default translation;
