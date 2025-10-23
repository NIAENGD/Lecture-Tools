const translation = {
  "navigation": {
    "home": "Accueil",
    "catalog": "Catalogue",
    "tasks": "Tâches",
    "storage": "Stockage",
    "system": "Système",
    "importExport": "Importer / Exporter",
    "debug": "Débogage"
  },
  "actions": {
    "create": "Créer",
    "bulkUpload": "Import massif",
    "bulkDownload": "Téléchargement massif",
    "addToCart": "Ajouter au panier",
    "runCart": "Lancer le panier",
    "export": "Exporter",
    "import": "Importer",
    "purge": "Purger",
    "systemUpdate": "Mise à jour système",
    "debugToggle": "Debug activer/désactiver",
    "uploadRecording": "Téléverser un enregistrement",
    "uploadSlides": "Téléverser des diapositives",
    "createLecture": "Créer un cours",
    "addSelectionToCart": "Ajouter la sélection au panier"
  },
  "actionDescriptions": {
    "create": "Créer un nouveau cours sur place",
    "bulkUpload": "Importer des enregistrements ou diapositives en masse",
    "bulkDownload": "Préparer une archive pour les sélections",
    "addToCart": "Ajouter la sélection actuelle au panier",
    "runCart": "Exécuter les actions en file d’attente",
    "export": "Préparer un paquet d’export à télécharger",
    "import": "Fusionner ou remplacer depuis une archive",
    "purge": "Maintenir pour purger l’audio traité",
    "systemUpdate": "Maintenir pour planifier la mise à jour",
    "debugToggle": "Afficher ou masquer le flux de debug"
  },
  "layout": {
    "searchPlaceholder": "Rechercher partout",
    "searchLabel": "Recherche globale",
    "statusTimeline": "Chronologie des statuts",
    "languageToggle": "Changer de langue",
    "themeToggle": "Changer de thème",
    "cpuTooltip": "Charge CPU",
    "tasksTooltip": "Tâches actives",
    "storageTooltip": "Utilisation du stockage",
    "taskBadge": "{{value}} tâches",
    "storageBadge": "{{percent}} utilisé",
    "commandHint": "Appuyer pour ouvrir la recherche",
    "searchEmptyHint": "Tapez pour rechercher dans tout l’espace de travail.",
    "searchNoMatches": "Aucune correspondance pour le moment.",
    "notificationsRegion": "Notifications (F8)",
    "dismiss": "Fermer",
    "openTasks": "Ouvrir les tâches",
    "helpLabel": "Aide",
    "openHelp": "Afficher le guide"
  },
  "helpOverlay": {
    "title": "Guide de l’interface",
    "subtitle": "Chaque zone actionnable est mise en évidence. Touchez pour en savoir plus.",
    "close": "Fermer le guide",
    "visibleActions": "Toutes les fonctions restent visibles",
    "pressHoldHint": "Le maintien protège les actions destructrices",
    "remember": "Ne plus afficher automatiquement",
    "dismiss": "J’ai compris",
    "topBar": {
      "title": "Barre supérieure",
      "body": "Recherche globale, état, langue, thème et accès à l’aide."
    },
    "megaRail": {
      "title": "Mega-rail",
      "body": "Accédez directement à Accueil, Catalogue, Tâches, Stockage, Système, Import/Export ou Debug."
    },
    "actionDock": {
      "title": "Dock d’actions",
      "body": "Opérations massives, contrôle du panier, import/export, purge et mise à jour système."
    },
    "timeline": {
      "title": "Chronologie de statut",
      "body": "Les tâches en direct, bascules GPU et finitions se regroupent ici."
    },
    "workCanvas": {
      "title": "Espace de travail",
      "body": "Disposition en trois volets : arbre, détails et ressources toujours visibles."
    },
    "catalogPaneA": {
      "title": "Arbre du catalogue",
      "body": "Recherchez, multi-sélectionnez et réorganisez classes, modules et cours."
    },
    "catalogPaneB": {
      "title": "Détails et édition",
      "body": "Consultez les métadonnées, basculez en édition en ligne et appliquez des mises à jour groupées."
    },
    "catalogPaneC": {
      "title": "Ressources et actions",
      "body": "Téléversez, téléchargez, transcrivez, traitez les diapositives et envoyez au panier."
    },
    "taskCart": {
      "title": "Panier de tâches",
      "body": "File d’attente, réorganisation, tests à blanc et presets pour l’automatisation."
    },
    "home": {
      "title": "Centre de mission",
      "body": "Tuiles rapides pour les imports et actions les plus courants."
    },
    "homeActivity": {
      "title": "Activité récente",
      "body": "Rouvrez les dernières opérations en un seul geste."
    },
    "homeSnapshot": {
      "title": "Instantané système",
      "body": "Vérifiez GPU, stockage et tâches en file d’un coup d’œil."
    }
  },
  "home": {
    "title": "Centre de mission",
    "subtitle": "Lancez les imports, surveillez les opérations et restez à deux actions de chaque tâche.",
    "quickActionsTitle": "Actions rapides",
    "quickTileDescriptions": {
      "uploadRecording": "Masterisez et transcrivez automatiquement.",
      "uploadSlides": "Transformez les diapositives en notes recherchables.",
      "createLecture": "Ajoutez des métadonnées et organisez les modules.",
      "addSelectionToCart": "Mettez en file d’attente en mode sérénité.",
      "runCart": "Lancez les automatisations en attente."
    },
    "recentActivityTitle": "Activité récente",
    "recentActivitySubtitle": "Consultez les dernières opérations en un seul geste.",
    "systemSnapshot": "Instantané du système",
    "metrics": {
      "gpu": "Support GPU",
      "storage": "Stockage utilisé",
      "queued": "Tâches en file",
      "gpuActive": "Actif",
      "gpuFallback": "Repli"
    },
    "open": "Ouvrir"
  },
  "auth": {
    "accessDeniedTitle": "Accès refusé",
    "accessDeniedBody": "Vous devez disposer du droit {{roles}} pour effectuer cette action."
  },
  "feedback": {
    "createQueued": {
      "title": "Créer un cours",
      "body": "Éditeur en ligne ouvert dans le catalogue."
    },
    "bulkUpload": {
      "title": "Import massif prêt",
      "body": "Déposez fichiers ou dossiers pour démarrer."
    },
    "bulkDownload": {
      "title": "Assistant d’export",
      "body": "Sélections préparées dans Import/Export."
    },
    "addToCart": {
      "title": "Panier de tâches",
      "body": "Sélection ajoutée. Vérifiez avant d’exécuter."
    },
    "runCartEmpty": {
      "title": "Panier vide",
      "body": "Ajoutez au moins une tâche avant d’exécuter."
    },
    "runCart": {
      "title": "Panier en cours",
      "body": "Suivi depuis la vue Tâches."
    },
    "export": {
      "title": "Export prêt",
      "body": "Archive en file dans Import/Export."
    },
    "import": {
      "title": "Import prêt",
      "body": "Choisissez l’archive pour vérifier avant de valider."
    },
    "purge": {
      "title": "Purge massive lancée",
      "body": "Candidats verrouillés avec annulation 10 s."
    },
    "systemUpdate": {
      "title": "Mise à jour système",
      "body": "Mise à jour en file. Commandes verrouillées pendant l’application."
    },
    "debug": {
      "title": "Mode debug",
      "body": "Console de debug basculée."
    }
  }
} as const;

export default translation;
