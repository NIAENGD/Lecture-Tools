const translation = {
  "navigation": {
    "home": "主页",
    "catalog": "目录",
    "tasks": "任务",
    "storage": "存储",
    "system": "系统",
    "importExport": "导入 / 导出",
    "debug": "调试"
  },
  "actions": {
    "create": "创建",
    "bulkUpload": "批量上传",
    "bulkDownload": "批量下载",
    "addToCart": "加入任务车",
    "runCart": "运行任务车",
    "export": "导出",
    "import": "导入",
    "purge": "清理",
    "systemUpdate": "系统更新",
    "debugToggle": "调试开关",
    "uploadRecording": "上传录音",
    "uploadSlides": "上传幻灯片",
    "createLecture": "创建课程",
    "addSelectionToCart": "选择加入任务车"
  },
  "actionDescriptions": {
    "create": "即时创建新的课程",
    "bulkUpload": "批量上传录音或幻灯片",
    "bulkDownload": "为所选内容排队生成压缩包",
    "addToCart": "将当前选择加入任务车",
    "runCart": "执行任务车中的排队操作",
    "export": "准备导出包以供下载",
    "import": "从存档中合并或替换",
    "purge": "长按清理已处理音频",
    "systemUpdate": "长按安排更新",
    "debugToggle": "切换调试流可见性"
  },
  "layout": {
    "searchPlaceholder": "搜索全部内容",
    "searchLabel": "全局搜索",
    "statusTimeline": "状态时间轴",
    "languageToggle": "切换语言",
    "themeToggle": "切换主题",
    "cpuTooltip": "CPU 负载",
    "tasksTooltip": "活动任务",
    "storageTooltip": "存储使用率",
    "taskBadge": "{{value}} 个任务",
    "storageBadge": "已使用 {{percent}}",
    "commandHint": "按下打开搜索",
    "searchEmptyHint": "输入即可搜索整个工作区。",
    "searchNoMatches": "暂时没有匹配结果。",
    "notificationsRegion": "通知 (F8)",
    "dismiss": "关闭",
    "openTasks": "打开任务",
    "helpLabel": "帮助",
    "openHelp": "显示界面指引"
  },
  "helpOverlay": {
    "title": "界面导览",
    "subtitle": "所有可操作区域都会高亮显示，轻触即可了解详情。",
    "close": "关闭导览",
    "visibleActions": "所有功能始终可见",
    "pressHoldHint": "长按可保护危险操作",
    "remember": "不再自动显示",
    "dismiss": "知道了",
    "topBar": {
      "title": "顶部栏",
      "body": "全局搜索、查看状态、切换语言主题并打开帮助。"
    },
    "megaRail": {
      "title": "侧边导航",
      "body": "快速进入主页、目录、任务、存储、系统、导入导出或调试。"
    },
    "actionDock": {
      "title": "动作停靠栏",
      "body": "一键批量操作、任务车控制、导入导出、清理和系统更新。"
    },
    "timeline": {
      "title": "状态时间轴",
      "body": "实时任务、GPU 回退和完成记录都会折叠在此。"
    },
    "workCanvas": {
      "title": "工作画布",
      "body": "三栏布局同时展示课程树、详情和资源。"
    },
    "catalogPaneA": {
      "title": "课程树",
      "body": "搜索、批量选择并拖动以重新排序班级、模块和课次。"
    },
    "catalogPaneB": {
      "title": "详情与编辑",
      "body": "查看元数据、切换内联编辑并执行批量更新。"
    },
    "catalogPaneC": {
      "title": "资源与操作",
      "body": "上传下载、转写、处理幻灯片并加入任务车。"
    },
    "taskCart": {
      "title": "任务车",
      "body": "排队、排序、试运行并保存批处理预设。"
    },
    "home": {
      "title": "任务控制台",
      "body": "快捷磁贴涵盖最常用的上传与运行操作。"
    },
    "homeActivity": {
      "title": "最近活动",
      "body": "随时查看并重新打开最近的操作。"
    },
    "homeSnapshot": {
      "title": "系统概览",
      "body": "一眼了解 GPU 状态、存储使用和任务车排队。"
    }
  },
  "home": {
    "title": "任务控制台",
    "subtitle": "发起上传、监控运行，所有任务两步可达。",
    "quickActionsTitle": "快捷操作",
    "quickTileDescriptions": {
      "uploadRecording": "自动母带处理并转写。",
      "uploadSlides": "将幻灯片处理为可搜索笔记。",
      "createLecture": "添加元数据并组织模块。",
      "addSelectionToCart": "加入安宁模式队列。",
      "runCart": "立即执行排队自动化。"
    },
    "recentActivityTitle": "最近活动",
    "recentActivitySubtitle": "查看最近操作，轻触即开。",
    "systemSnapshot": "系统概览",
    "metrics": {
      "gpu": "GPU 支持",
      "storage": "存储使用",
      "queued": "排队任务",
      "gpuActive": "正常",
      "gpuFallback": "回退"
    },
    "open": "打开"
  },
  "auth": {
    "accessDeniedTitle": "无权访问",
    "accessDeniedBody": "需要 {{roles}} 权限才能完成此操作。"
  },
  "feedback": {
    "createQueued": {
      "title": "创建课程",
      "body": "目录中的内联编辑器已打开。"
    },
    "bulkUpload": {
      "title": "批量上传就绪",
      "body": "拖放文件或文件夹即可开始。"
    },
    "bulkDownload": {
      "title": "导出构建器",
      "body": "已在导入/导出中准备所选内容。"
    },
    "addToCart": {
      "title": "任务车",
      "body": "已添加选择。运行前请检查。"
    },
    "runCartEmpty": {
      "title": "任务车为空",
      "body": "运行前请至少添加一个任务。"
    },
    "runCart": {
      "title": "任务车运行中",
      "body": "请在任务视图中监控。"
    },
    "export": {
      "title": "导出已准备",
      "body": "存档已在导入/导出中排队。"
    },
    "import": {
      "title": "导入就绪",
      "body": "选择存档并在提交前检查。"
    },
    "purge": {
      "title": "批量清理已启动",
      "body": "候选项已锁定，可 10 秒内撤销。"
    },
    "systemUpdate": {
      "title": "系统更新",
      "body": "更新已排队，执行期间控件被锁定。"
    },
    "debug": {
      "title": "调试模式",
      "body": "已切换调试控制台。"
    }
  }
} as const;

export default translation;
