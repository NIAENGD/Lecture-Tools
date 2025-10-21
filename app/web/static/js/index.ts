// @ts-nocheck
import '../styles/main.scss';

declare global {
  interface Window {
    __LECTURE_TOOLS_SERVER_ROOT_PATH__?: string | null;
    __LECTURE_TOOLS_BASE_PATH__?: string;
    __LECTURE_TOOLS_PDFJS_SCRIPT_URL__?: string;
    __LECTURE_TOOLS_PDFJS_WORKER_URL__?: string;
    __LECTURE_TOOLS_PDFJS_MODULE_URL__?: string;
    __LECTURE_TOOLS_PDFJS_WORKER_MODULE_URL__?: string;
  }
}

function bootstrapEnvironmentFromDataset(): void {
  const body = document.body;
  if (!body) {
    return;
  }
  const { dataset } = body;
  window.__LECTURE_TOOLS_SERVER_ROOT_PATH__ = dataset.rootPath ?? '';
  window.__LECTURE_TOOLS_PDFJS_SCRIPT_URL__ = dataset.pdfjsScript ?? '';
  window.__LECTURE_TOOLS_PDFJS_WORKER_URL__ = dataset.pdfjsWorker ?? '';
  window.__LECTURE_TOOLS_PDFJS_MODULE_URL__ = dataset.pdfjsModule ?? '';
  window.__LECTURE_TOOLS_PDFJS_WORKER_MODULE_URL__ = dataset.pdfjsWorkerModule ?? '';
}

bootstrapEnvironmentFromDataset();

(async function () {
        const translations = {
          en: {
            document: {
              title: 'Lecture Tools',
            },
            sidebar: {
              heading: 'Lecture Tools',
              tagline: 'Review, organise, and process lecture resources quickly.',
              overview: 'Overview',
              syllabusTitle: 'Course syllabus',
              searchLabel: 'Search the syllabus',
              searchPlaceholder: 'Search by name',
              loading: 'Loading…',
            },
            topBar: {
              details: 'Details',
              enableEdit: 'Enable edit mode',
              exitEdit: 'Exit edit mode',
              progress: 'Progress',
              create: 'Create',
              storage: 'Storage',
              settings: 'Settings',
            },
            details: {
              title: 'Lecture details',
              deleteLecture: 'Delete lecture',
              editModeBanner:
                'Edit mode is enabled. Update lecture information or remove items while it is active.',
              summaryPlaceholder: 'Select a lecture from the curriculum.',
              edit: {
                titleLabel: 'Title',
                moduleLabel: 'Module',
                descriptionLabel: 'Description',
                save: 'Save changes',
              },
              noDescription: 'No description recorded yet.',
            },
            assets: {
              title: 'Assets',
              transcribe: 'Transcribe audio',
              modelLabel: 'Model',
              model: {
                tiny: 'tiny',
                base: 'base',
                small: 'small',
                medium: 'medium',
                large: 'large',
                gpu: 'GPU (hardware accelerated)',
              },
              labels: {
                audio: 'Audio (.wav, .mp3, .m4a, .aac, .flac, .ogg, .opus)',
                masteredAudio: 'Mastered audio',
                slides: 'Slides (PDF)',
                transcript: 'Transcript',
                notes: 'Notes',
                slideBundle: 'Slide bundle (Markdown + ZIP)',
              },
              status: {
                notLinked: 'Not linked',
                slidesHint: 'Upload a PDF, then process it to generate the Markdown bundle.',
                noSlideImages: 'No slide bundle yet. Use “Process slides” after uploading a PDF.',
                linked: 'Linked: {{name}}',
                slidesUploaded: 'Slides uploaded: {{name}}',
                archiveCreated: 'Bundle created: {{name}}',
                mastered: 'Mastered: {{name}}',
              },
              actions: {
                upload: 'Upload',
                processSlides: 'Process slides',
                download: 'Download',
                remove: 'Remove',
              },
            },
            progress: {
              title: 'Processing queue',
              description: 'Track conversions, mastering, and transcriptions as they run.',
              empty: 'No active tasks.',
              refresh: 'Refresh',
              retry: 'Retry',
              dismiss: 'Dismiss',
              openLecture: 'Open lecture',
              status: {
                running: 'In progress',
                finished: 'Completed',
                error: 'Needs attention',
              },
              labels: {
                transcription: 'Transcription',
                slideBundle: 'Slide bundle generation',
                audioMastering: 'Audio mastering',
                processing: 'Processing task',
                untitled: 'Untitled lecture',
              },
              retryUnavailable: 'Retry is not available for this task.',
            },
            create: {
              title: 'Create lecture',
              moduleLabel: 'Module',
              titleLabel: 'Title',
              descriptionLabel: 'Description',
              submit: 'Add lecture',
            },
            settings: {
              title: 'Settings',
              appearance: {
                legend: 'Appearance',
                themeLabel: 'Theme',
                theme: {
                  system: 'Follow system',
                  light: 'Light',
                  dark: 'Dark',
                },
              },
              language: {
                label: 'Language',
                choices: {
                  en: 'English',
                  zh: '中文 (Chinese)',
                  es: 'Español (Spanish)',
                  fr: 'Français (French)',
                },
              },
              debug: {
                legend: 'Debugging',
                enable: 'Enable debug mode',
                description:
                  'Show a live console on the right that streams detailed program output.',
              },
              whisper: {
                legend: 'Whisper transcription',
                modelLabel: 'Default model',
                model: {
                  tiny: 'Tiny (fastest)',
                  base: 'Base (balanced)',
                  small: 'Small (accurate)',
                  medium: 'Medium (detailed)',
                  large: 'Large (maximum accuracy)',
                  gpu: 'GPU (hardware accelerated)',
                },
                computeLabel: 'Compute type',
                beamLabel: 'Beam size',
                gpu: {
                  label: 'GPU support',
                  status: 'GPU acceleration not tested.',
                  test: 'Test support',
                  retry: 'Re-run test',
                },
              },
              audio: {
                legend: 'Audio',
                masteringLabel: 'Enable mastered audio',
                masteringDescription: 'Automatically enhance uploaded audio for clarity.',
              },
              slides: {
                legend: 'Slides',
                dpiLabel: 'Rendering DPI',
                dpi: {
                  150: '150 dpi (fastest)',
                  200: '200 dpi (balanced)',
                  300: '300 dpi (detailed)',
                  400: '400 dpi (high detail)',
                  600: '600 dpi (maximum)',
                },
              },
              update: {
                legend: 'System updates',
                description: 'Update Lecture Tools without leaving the browser.',
                run: 'Run update',
                refresh: 'Refresh status',
                status: {
                  idle: 'No update in progress.',
                  running: 'Update running. Keep this window open until it completes.',
                  success: 'The most recent update completed successfully.',
                  failure: 'The most recent update encountered an error.',
                },
                startedAt: 'Started {{time}}.',
                finishedAt: 'Finished {{time}}.',
                exitCode: 'Exit code {{code}}.',
                logLabel: 'Activity log',
                logEmpty: 'No update activity yet.',
              },
              archive: {
                legend: 'Archive',
                description:
                  'Export your lectures and assets or import an archive from another machine.',
                export: 'Export archive',
                import: 'Import archive',
                modeLabel: 'Import mode',
                modes: {
                  merge: 'Import and add to existing content',
                  replace: 'Clear existing content and overwrite',
                },
                hint: 'Exported archives are stored temporarily and cleared when the app starts.',
              },
              save: 'Save settings',
              exit: 'Exit application',
            },
            storage: {
              title: 'Storage manager',
              subtitle: 'Review stored assets by class hierarchy.',
              loading: 'Loading…',
              empty: 'No stored classes found.',
              usage: {
                used: 'Used',
                available: 'Available',
                total: 'Total',
              },
              actions: {
                refresh: 'Refresh',
                downloadSelected: 'Download selected',
                purge: 'Remove processed audio',
              },
              browser: {
                root: 'Root',
                up: 'Up',
                loading: 'Loading…',
                empty: 'No files or folders found.',
                select: 'Select',
                name: 'Name',
                type: 'Type',
                size: 'Size',
                modified: 'Modified',
                actions: 'Actions',
                directory: 'Folder',
                file: 'File',
                unnamed: 'Unnamed item',
                selectAction: 'Select {{name}}',
              },
              purge: {
                none: 'No processed audio to remove.',
                available: '{{count}} {{lectureWord}} ready for cleanup.',
                working: 'Removing audio…',
                readyCount: '{{count}} {{lectureWord}} ready for cleanup',
              },
              classes: {
                summary: '{{moduleCount}} {{moduleWord}} • {{lectureCount}} {{lectureWord}}',
                empty: 'No modules stored for this class yet.',
                masteredCount: '{{count}} {{lectureWord}} with mastered audio',
              },
              modules: {
                summary: '{{lectureCount}} {{lectureWord}}',
                empty: 'No lectures stored for this module yet.',
                masteredCount: '{{count}} {{lectureWord}} with mastered audio',
              },
              lecture: {
                audio: 'Audio',
                processedAudio: 'Mastered audio',
                transcript: 'Transcript',
                notes: 'Notes',
                slides: 'Slides',
                empty: 'No linked assets.',
                eligible: 'Audio ready for removal',
                processedBadge: 'Mastered audio',
              },
              dialogs: {
                purgeTitle: 'Remove processed audio',
                purgeMessage:
                  'Delete audio files for {{count}} {{lectureWord}} that already have transcripts? This cannot be undone.',
                deleteTitle: 'Delete storage item',
                deleteMessage: 'Delete “{{name}}” from storage? This cannot be undone.',
                deleteConfirm: 'Delete',
              },
              unnamedClass: 'Untitled class',
              unnamedModule: 'Untitled module',
              unnamedLecture: 'Untitled lecture',
            },
            debug: {
              title: 'Debug console',
              live: 'Live',
              empty: 'Enable debug mode to inspect program activity in real time.',
              error: 'Unable to load debug output.',
              stream: {
                title: 'Server activity',
                empty: 'Waiting for server activity…',
              },
            },
            dialog: {
              cancel: 'Cancel',
              confirm: 'Confirm',
            },
            stats: {
              classes: 'Classes',
              modules: 'Modules',
              lectures: 'Lectures',
              transcripts: 'Transcripts',
              slideDecks: 'Slide decks',
              audio: 'Audio files',
              processedAudio: 'Mastered audio',
              notes: 'Notes',
              slideArchives: 'Slide bundles',
            },
            dialogs: {
              createClass: {
                title: 'Create class',
                message: 'Enter a class name.',
                placeholder: 'Introduction to Astronomy',
              },
              createModule: {
                title: 'Create module',
                message: 'Module name for {{className}}',
                placeholder: 'Foundations',
              },
              createLecture: {
                title: 'Create lecture',
                message: 'Lecture title for {{context}}',
                placeholder: 'Lecture title',
              },
              lectureDescription: {
                title: 'Lecture description',
                placeholder: 'Add a short outline…',
              },
              deleteClass: {
                title: 'Delete class',
                message: 'Delete class "{{className}}"?',
                cancel: 'Keep class',
                summary: 'This will remove {{moduleCount}} {{moduleWord}} and {{lectureCount}} {{lectureWord}}.',
              },
              deleteModule: {
                title: 'Delete module',
                message: 'Delete module "{{moduleName}}"{{classContext}}?',
                cancel: 'Keep module',
                summary: 'This will remove {{lectureCount}} {{lectureWord}}.',
                classContext: ' from "{{className}}"',
              },
              deleteLecture: {
                title: 'Delete lecture',
                message: 'Delete lecture "{{context}}" and all linked assets?',
                cancel: 'Keep lecture',
              },
              removeAsset: {
                title: 'Remove {{asset}}',
                message: 'Remove the current {{asset}} from this lecture? This cannot be undone.',
                confirm: 'Remove asset',
              },
              confirmDeletion: {
                title: 'Confirm deletion',
                message: 'This action cannot be undone. Do you want to permanently remove it?',
                confirm: 'Yes, delete it',
              },
              gpuWhisper: {
                title: 'GPU Whisper',
              },
              exitApp: {
                title: 'Exit application',
                message: 'Stop the Lecture Tools server and close this tab?',
              },
              slideRange: {
                title: 'Select pages to process',
                description:
                  'Review the slide thumbnails and choose which pages to convert into images.',
                loading: 'Loading preview…',
                error:
                  'Slide previews are shown below. Adjust the range manually if needed.',
                startLabel: 'Start page',
                endLabel: 'End page',
                rangeHint: 'Use the inputs or page previews to adjust the selection.',
                zoomLabel: 'Preview zoom',
                zoomValue: '{{value}}% view',
                fallbackMessage:
                  'Open the PDF below in a new tab if you need to inspect it directly.',
                fallbackLink: 'Open PDF in new tab',
                fallbackFrameTitle: 'Fallback PDF preview',
                summary: 'Processing pages {{start}}–{{end}} of {{total}}.',
                summarySingle: 'Processing page {{start}} of {{total}}.',
                summaryUnknown: 'Processing pages {{start}}–{{end}}.',
                summarySingleUnknown: 'Processing page {{start}}.',
                allPages: 'Processing all pages in the document.',
                pageLabel: 'Page {{page}}',
                selectAll: 'Select all',
                confirm: 'Confirm & Continue',
              },
              upload: {
                title: 'Upload file',
                description: 'Drag a file here or browse to select one from your computer.',
                prompt: 'Drag and drop a file',
                help: 'You can also click to choose a file.',
                browse: 'Select file',
                clear: 'Remove',
                waiting: 'Select a file to continue.',
                preparing: 'Preparing file…',
                uploading: 'Uploading…',
                processing: 'Processing upload…',
                processingAction: 'Processing…',
                processingAudio: 'Processing audio…',
                processingSlides: 'Processing slides…',
                backgroundProcessing:
                  'Audio mastering will continue in the background. You can close this dialog while it finishes.',
                backgroundProcessingSlides:
                  'Slide conversion will continue in the background. You can close this dialog while it finishes.',
                success: 'Upload completed.',
                failure: 'Upload failed. Please try again.',
                progress: 'Upload progress',
                action: 'Upload',
                assetTitle: 'Upload {{asset}}',
                assetDescription: 'Choose a new file to attach to this resource.',
                archiveTitle: 'Import archive',
                archiveDescription: 'Select a Lecture Tools export (.zip) to import.',
              },
              descriptionOptional: 'Description (optional)',
              descriptionPlaceholder: 'Add a short summary…',
            },
            dropdowns: {
              selectModule: 'Select module…',
              noModules: 'No modules available',
            },
            placeholders: {
              noLectures: 'No lectures',
              noLecturesFilter: 'No lectures match the current filter.',
              noClasses: 'No classes available yet.',
              noModules: 'No modules yet.',
            },
            curriculum: {
              addClass: 'Add class',
              addModule: 'Add module',
              manageHeading: 'Manage syllabus',
              classMeta: '{{moduleCount}} {{moduleWord}} • {{lectureCount}} {{lectureWord}}',
              moduleMeta: '{{lectureCount}} {{lectureWord}}',
            },
            common: {
              actions: {
                create: 'Create',
                save: 'Save',
                skip: 'Skip',
                delete: 'Delete',
                open: 'Open',
                upload: 'Upload',
                exit: 'Exit',
                close: 'Close',
                ok: 'OK',
              },
            },
            status: {
              requireEdit: 'Enable edit mode to manage the curriculum.',
              requireEditLecture: 'Enable edit mode to update lecture details.',
              classCreated: 'Class created.',
              classRemoved: 'Class removed.',
              moduleCreated: 'Module created.',
              moduleRemoved: 'Module removed.',
              lectureCreated: 'Lecture created.',
              lectureRemoved: 'Lecture removed.',
              lectureUpdated: 'Lecture updated.',
              lectureTitleRequired: 'Lecture title is required.',
              createLectureRequirements: 'Select a module and enter a title.',
              slidesProcessed: 'Slides processed into a Markdown bundle with images.',
              slidesUploaded: 'Slides uploaded. Process them to generate the Markdown bundle.',
              slidesUploadRequired: 'Upload a PDF before processing slides.',
              slidePreviewFailed: 'Unable to prepare the slide preview. Try re-uploading the PDF.',
              processingSlides: 'Processing slides…',
              audioProcessingQueued: 'Audio uploaded. Mastering will continue in the background.',
              assetUploaded: 'Asset uploaded successfully.',
              assetRemoved: 'Asset removed.',
              transcriptionPreparing: '====> Preparing transcription…',
              transcriptionCompleted: 'Transcription completed.',
              processing: 'Processing…',
              storageLoadFailed: 'Unable to load storage contents.',
              storageUsageFailed: 'Unable to load storage usage.',
              storagePurged: 'Removed processed audio files.',
              storagePurgeFailed: 'Unable to remove processed audio files.',
              storageDeleted: 'Storage item deleted.',
              storageDeleteFailed: 'Unable to delete storage item.',
              storageDownloadReady: 'Download ready.',
              storageDownloadFailed: 'Unable to prepare download.',
              storageDownloadNone: 'Select at least one item to download.',
              gpuChecking: '====> Checking GPU Whisper support…',
              gpuConfirmed: 'GPU Whisper support confirmed.',
              gpuUnavailable: 'GPU acceleration is unavailable on this platform.',
              gpuUnsupported: 'GPU Whisper is not supported on this platform.',
              gpuNotAvailable: 'GPU acceleration is not available on this platform.',
              updateStarted: 'Update started.',
              updateRunning: 'Update in progress. Keep this window open.',
              updateCompleted: 'Update completed successfully.',
              updateFailed: 'Update failed. Review the log for details.',
              updateConflict: 'An update is already running.',
              shuttingDown: 'Shutting down application…',
              settingsSaved: 'Settings saved.',
              gpuFallback: 'Falling back to {{model}} model.',
              lectureReordered: 'Lecture order updated.',
              exporting: 'Preparing archive…',
              exportReady: 'Archive ready to download.',
              exportFailed: 'Unable to create archive.',
              importing: 'Importing archive…',
              importSuccess: 'Imported {{count}} lectures.',
              importNoChanges: 'Archive imported (no new lectures).',
            },
            counts: {
              module: { one: 'module', other: 'modules' },
              lecture: { one: 'lecture', other: 'lectures' },
            },
          },
          zh: {
            document: {
              title: '课堂助手',
            },
            sidebar: {
              heading: '课堂助手',
              tagline: '快速审阅、整理并处理课程资源。',
              overview: '概览',
              syllabusTitle: '课程大纲',
              searchLabel: '搜索课程大纲',
              searchPlaceholder: '按名称搜索',
              loading: '正在加载…',
            },
            topBar: {
              details: '详情',
              enableEdit: '开启编辑模式',
              exitEdit: '退出编辑模式',
              progress: '进度',
              create: '新建',
              storage: '存储',
              settings: '设置',
            },
            details: {
              title: '讲座详情',
              deleteLecture: '删除讲座',
              editModeBanner: '编辑模式已开启，可更新讲座信息或移除项目。',
              summaryPlaceholder: '从课程表中选择一个讲座。',
              edit: {
                titleLabel: '标题',
                moduleLabel: '模块',
                descriptionLabel: '描述',
                save: '保存更改',
              },
              noDescription: '尚未记录描述。',
            },
            assets: {
              title: '资源',
              transcribe: '转录音频',
              modelLabel: '模型',
              model: {
                tiny: 'tiny',
                base: 'base',
                small: 'small',
                medium: 'medium',
                large: 'large',
                gpu: 'GPU（硬件加速）',
              },
              labels: {
                audio: '音频（.wav、.mp3、.m4a、.aac、.flac、.ogg、.opus）',
                masteredAudio: '优化音频',
                slides: '课件（PDF）',
                transcript: '逐字稿',
                notes: '笔记',
                slideBundle: '课件资源包（Markdown + ZIP）',
              },
              status: {
                notLinked: '未关联',
                slidesHint: '先上传 PDF，然后使用“处理课件”生成 Markdown 资源包。',
                noSlideImages: '尚未生成课件资源包。上传 PDF 后点击“处理课件”。',
                linked: '已关联：{{name}}',
                slidesUploaded: '已上传课件：{{name}}',
                archiveCreated: '已生成资源包：{{name}}',
                mastered: '已优化：{{name}}',
              },
              actions: {
                upload: '上传',
                processSlides: '处理课件',
                download: '下载',
                remove: '移除',
              },
            },
            progress: {
              title: '处理队列',
              description: '实时跟踪转换、音频优化和转录进度。',
              empty: '当前没有任务。',
              refresh: '刷新',
              retry: '重试',
              dismiss: '忽略',
              openLecture: '打开课次',
              status: {
                running: '处理中',
                finished: '已完成',
                error: '需要关注',
              },
              labels: {
                transcription: '音频转录',
                slideBundle: '课件资源打包',
                audioMastering: '音频优化',
                processing: '处理任务',
                untitled: '未命名讲座',
              },
              retryUnavailable: '此任务无法重试。',
            },
            create: {
              title: '创建讲座',
              moduleLabel: '模块',
              titleLabel: '标题',
              descriptionLabel: '描述',
              submit: '添加讲座',
            },
            settings: {
              title: '设置',
              appearance: {
                legend: '外观',
                themeLabel: '主题',
                theme: {
                  system: '跟随系统',
                  light: '浅色',
                  dark: '深色',
                },
              },
              language: {
                label: '语言',
                choices: {
                  en: 'English（英语）',
                  zh: '中文（简体）',
                  es: 'Español（西班牙语）',
                  fr: 'Français（法语）',
                },
              },
              debug: {
                legend: '调试',
                enable: '启用调试模式',
                description: '在右侧显示实时程序输出的控制台。',
              },
              whisper: {
                legend: 'Whisper 转录',
                modelLabel: '默认模型',
                model: {
                  tiny: 'Tiny（最快）',
                  base: 'Base（均衡）',
                  small: 'Small（更准）',
                  medium: 'Medium（细致）',
                  large: 'Large（最高准确度）',
                  gpu: 'GPU（硬件加速）',
                },
                computeLabel: '计算类型',
                beamLabel: '束搜索宽度',
                gpu: {
                  label: 'GPU 支持',
                  status: '尚未测试 GPU 加速。',
                  test: '测试支持',
                  retry: '重新测试',
                },
              },
              audio: {
                legend: '音频',
                masteringLabel: '启用音频优化',
                masteringDescription: '自动增强上传的音频以提高清晰度。',
              },
              slides: {
                legend: '课件',
                dpiLabel: '渲染 DPI',
                dpi: {
                  150: '150 dpi（最快）',
                  200: '200 dpi（均衡）',
                  300: '300 dpi（更细致）',
                  400: '400 dpi（高细节）',
                  600: '600 dpi（最高）',
                },
              },
              update: {
                legend: '系统更新',
                description: '在浏览器内更新 Lecture Tools。',
                run: '运行更新',
                refresh: '刷新状态',
                status: {
                  idle: '当前没有更新任务。',
                  running: '正在更新。请保持此窗口打开直到完成。',
                  success: '最近一次更新已成功完成。',
                  failure: '最近一次更新时发生错误。',
                },
                startedAt: '开始于 {{time}}。',
                finishedAt: '结束于 {{time}}。',
                exitCode: '退出代码 {{code}}。',
                logLabel: '活动日志',
                logEmpty: '暂时没有更新活动。',
              },
              archive: {
                legend: '归档',
                description: '导出讲座及资源，或从其他设备导入归档文件。',
                export: '导出归档',
                import: '导入归档',
                modeLabel: '导入模式',
                modes: {
                  merge: '追加到现有内容',
                  replace: '清空现有内容并覆盖',
                },
                hint: '导出的归档会临时保存，并在应用启动时清理。',
              },
              save: '保存设置',
              exit: '退出应用',
            },
            storage: {
              title: '存储管理器',
              subtitle: '按课堂结构查看存储的资源。',
              loading: '正在加载…',
              empty: '没有检测到存储的班级。',
              usage: {
                used: '已用',
                available: '可用',
                total: '总计',
              },
              actions: {
                refresh: '刷新',
                downloadSelected: '下载所选项',
                purge: '移除已处理的音频',
              },
              browser: {
                root: '根目录',
                up: '上一级',
                loading: '正在加载…',
                empty: '此位置没有文件或文件夹。',
                select: '选择',
                name: '名称',
                type: '类型',
                size: '大小',
                modified: '修改时间',
                actions: '操作',
                directory: '文件夹',
                file: '文件',
                unnamed: '未命名项目',
                selectAction: '选择{{name}}',
              },
              purge: {
                none: '没有可移除的音频。',
                available: '有 {{count}} 个{{lectureWord}}可清理。',
                working: '正在移除音频…',
                readyCount: '{{count}} 个{{lectureWord}}可清理',
              },
              classes: {
                summary: '{{moduleCount}} 个{{moduleWord}} • {{lectureCount}} 个{{lectureWord}}',
                empty: '该班级暂无存储的模块。',
                masteredCount: '{{count}} 个{{lectureWord}}含优化音频',
              },
              modules: {
                summary: '{{lectureCount}} 个{{lectureWord}}',
                empty: '该模块暂无存储的讲座。',
                masteredCount: '{{count}} 个{{lectureWord}}含优化音频',
              },
              lecture: {
                audio: '音频',
                processedAudio: '优化音频',
                transcript: '逐字稿',
                notes: '笔记',
                slides: '课件',
                empty: '尚未关联资源。',
                eligible: '音频可安全移除',
                processedBadge: '已生成优化音频',
              },
              dialogs: {
                purgeTitle: '移除已处理的音频',
                purgeMessage: '确认删除 {{count}} 个已生成逐字稿的{{lectureWord}}音频文件？此操作无法撤销。',
                deleteTitle: '删除存储项目',
                deleteMessage: '确定要删除“{{name}}”吗？此操作无法撤销。',
                deleteConfirm: '删除',
              },
              unnamedClass: '未命名班级',
              unnamedModule: '未命名模块',
              unnamedLecture: '未命名讲座',
            },
            debug: {
              title: '调试控制台',
              live: '实时',
              empty: '启用调试模式以实时查看程序活动。',
              error: '无法加载调试输出。',
              stream: {
                title: '服务器活动',
                empty: '等待服务器活动…',
              },
            },
            dialog: {
              cancel: '取消',
              confirm: '确认',
            },
            stats: {
              classes: '课程',
              modules: '模块',
              lectures: '讲座',
              transcripts: '逐字稿',
              slideDecks: '课件',
              audio: '音频文件',
              processedAudio: '优化音频',
              notes: '笔记',
              slideArchives: '课件资源包',
            },
            dialogs: {
              createClass: {
                title: '创建课程',
                message: '输入课程名称。',
                placeholder: '天文学导论',
              },
              createModule: {
                title: '创建模块',
                message: '为 {{className}} 输入模块名称',
                placeholder: '基础内容',
              },
              createLecture: {
                title: '创建讲座',
                message: '为 {{context}} 输入讲座标题',
                placeholder: '讲座标题',
              },
              lectureDescription: {
                title: '讲座描述',
                placeholder: '添加简短大纲…',
              },
              deleteClass: {
                title: '删除课程',
                message: '删除课程“{{className}}”？',
                cancel: '保留课程',
                summary: '此操作将移除 {{moduleCount}} 个{{moduleWord}}和 {{lectureCount}} 个{{lectureWord}}。',
              },
              deleteModule: {
                title: '删除模块',
                message: '删除模块“{{moduleName}}”{{classContext}}？',
                cancel: '保留模块',
                summary: '此操作将移除 {{lectureCount}} 个{{lectureWord}}。',
                classContext: '（来自课程“{{className}}”）',
              },
              deleteLecture: {
                title: '删除讲座',
                message: '删除讲座“{{context}}”及其所有关联资源？',
                cancel: '保留讲座',
              },
              removeAsset: {
                title: '移除 {{asset}}',
                message: '要从此讲座中移除当前{{asset}}吗？此操作无法撤销。',
                confirm: '移除资源',
              },
              confirmDeletion: {
                title: '确认删除',
                message: '该操作无法撤销，确定要永久删除吗？',
                confirm: '是，删除',
              },
              gpuWhisper: {
                title: 'GPU Whisper',
              },
              exitApp: {
                title: '退出应用',
                message: '停止 Lecture Tools 服务器并关闭此标签页？',
              },
              slideRange: {
                title: '选择要处理的页面',
                description: '浏览下方的课件缩略图，选择要转换为图像的页面范围。',
                loading: '正在加载预览…',
                error: '下方显示的是服务器生成的课件预览，可按需手动调整页码范围。',
                startLabel: '起始页',
                endLabel: '结束页',
                rangeHint: '可通过输入框或页面预览调整选择范围。',
                zoomLabel: '预览缩放',
                zoomValue: '{{value}}% 视图',
                fallbackMessage: '如需直接查看 PDF，可在下方打开新标签页。',
                fallbackLink: '在新标签页打开 PDF',
                fallbackFrameTitle: '备用 PDF 预览',
                summary: '将处理第 {{start}}–{{end}} 页，共 {{total}} 页。',
                summarySingle: '将处理第 {{start}} 页，共 {{total}} 页。',
                summaryUnknown: '正在处理第 {{start}}–{{end}} 页。',
                summarySingleUnknown: '正在处理第 {{start}} 页。',
                allPages: '将处理文档中的全部页面。',
                pageLabel: '第 {{page}} 页',
                selectAll: '选择全部',
                confirm: '确认并继续',
              },
              upload: {
                title: '上传文件',
                description: '将文件拖到此处或浏览电脑进行选择。',
                prompt: '拖放文件',
                help: '也可以点击选择文件。',
                browse: '选择文件',
                clear: '移除',
                waiting: '请选择一个文件。',
                preparing: '准备文件…',
                uploading: '正在上传…',
                processing: '正在处理上传…',
                processingAction: '正在处理…',
                processingAudio: '正在处理音频…',
                processingSlides: '正在处理课件…',
                backgroundProcessing: '音频母带处理会在后台继续进行。您可以放心关闭此对话框。',
                backgroundProcessingSlides: '课件转换将在后台继续进行。您可以放心关闭此对话框。',
                success: '上传完成。',
                failure: '上传失败，请重试。',
                progress: '上传进度',
                action: '上传',
                assetTitle: '上传 {{asset}}',
                assetDescription: '为此资源选择一个新文件。',
                archiveTitle: '导入归档',
                archiveDescription: '选择一个 Lecture Tools 导出的压缩包（.zip）。',
              },
              descriptionOptional: '描述（可选）',
              descriptionPlaceholder: '添加简短摘要…',
            },
            dropdowns: {
              selectModule: '选择模块…',
              noModules: '暂无可用模块',
            },
            placeholders: {
              noLectures: '暂无讲座',
              noLecturesFilter: '没有符合当前筛选条件的讲座。',
              noClasses: '尚未有课程。',
              noModules: '暂无模块。',
            },
            curriculum: {
              addClass: '添加课程',
              addModule: '添加模块',
              manageHeading: '管理课程大纲',
              classMeta: '{{moduleCount}} 个{{moduleWord}} • {{lectureCount}} 个{{lectureWord}}',
              moduleMeta: '{{lectureCount}} 个{{lectureWord}}',
            },
            common: {
              actions: {
                create: '创建',
                save: '保存',
                skip: '跳过',
                delete: '删除',
                open: '打开',
                upload: '上传',
                exit: '退出',
                close: '关闭',
                ok: '好的',
              },
            },
            status: {
              requireEdit: '开启编辑模式以管理课程表。',
              requireEditLecture: '开启编辑模式以更新讲座详情。',
              classCreated: '课程已创建。',
              classRemoved: '课程已删除。',
              moduleCreated: '模块已创建。',
              moduleRemoved: '模块已删除。',
              lectureCreated: '讲座已创建。',
              lectureRemoved: '讲座已删除。',
              lectureUpdated: '讲座已更新。',
              lectureTitleRequired: '需要填写讲座标题。',
              createLectureRequirements: '请选择模块并输入标题。',
              slidesProcessed: '课件已转换为包含 Markdown 的资源包。',
              slidesUploaded: '课件已上传。处理后可生成 Markdown 资源包。',
              slidesUploadRequired: '请先上传 PDF 再处理课件。',
              slidePreviewFailed: '无法准备课件预览，请尝试重新上传 PDF。',
              processingSlides: '正在处理课件…',
              audioProcessingQueued: '音频已上传，母带处理将在后台继续进行。',
              assetUploaded: '资源上传成功。',
              assetRemoved: '资源已移除。',
              transcriptionPreparing: '====> 正在准备转录…',
              transcriptionCompleted: '转录完成。',
              processing: '处理中…',
              storageLoadFailed: '无法加载存储内容。',
              storageUsageFailed: '无法加载存储用量。',
              storagePurged: '已移除处理完成的音频。',
              storagePurgeFailed: '无法移除已处理的音频。',
              storageDeleted: '已删除存储项目。',
              storageDeleteFailed: '无法删除存储项目。',
              storageDownloadReady: '已准备好下载。',
              storageDownloadFailed: '无法准备下载。',
              storageDownloadNone: '请选择至少一个项目。',
              gpuChecking: '====> 正在检查 GPU Whisper 支持…',
              gpuConfirmed: 'GPU Whisper 支持已确认。',
              gpuUnavailable: '此平台不支持 GPU 加速。',
              gpuUnsupported: '此平台不支持 GPU Whisper。',
              gpuNotAvailable: '此平台无法使用 GPU 加速。',
              updateStarted: '已开始更新。',
              updateRunning: '正在更新，请保持此窗口打开。',
              updateCompleted: '更新已成功完成。',
              updateFailed: '更新失败。请查看日志了解详情。',
              updateConflict: '已有更新任务正在运行。',
              shuttingDown: '正在关闭应用…',
              settingsSaved: '设置已保存。',
              gpuFallback: '将回退到 {{model}} 模型。',
              lectureReordered: '课程顺序已更新。',
              exporting: '正在准备归档…',
              exportReady: '归档已生成，可供下载。',
              exportFailed: '无法创建归档。',
              importing: '正在导入归档…',
              importSuccess: '已导入 {{count}} 个讲座。',
              importNoChanges: '归档导入完成（没有新讲座）。',
            },
            counts: {
              module: { one: '模块', other: '模块' },
              lecture: { one: '讲座', other: '讲座' },
            },
          },
          es: {
            document: {
              title: 'Herramientas de clases',
            },
            sidebar: {
              heading: 'Herramientas de clases',
              tagline: 'Revisa, organiza y procesa recursos de clases rápidamente.',
              overview: 'Resumen',
              syllabusTitle: 'Programa del curso',
              searchLabel: 'Buscar en el programa',
              searchPlaceholder: 'Buscar por nombre',
              loading: 'Cargando…',
            },
            topBar: {
              details: 'Detalles',
              enableEdit: 'Activar modo edición',
              exitEdit: 'Salir del modo edición',
              progress: 'Progreso',
              create: 'Crear',
              storage: 'Almacenamiento',
              settings: 'Configuración',
            },
            details: {
              title: 'Detalles de la clase',
              deleteLecture: 'Eliminar clase',
              editModeBanner: 'El modo edición está activo. Actualiza o elimina elementos mientras esté activo.',
              summaryPlaceholder: 'Selecciona una clase del plan de estudios.',
              edit: {
                titleLabel: 'Título',
                moduleLabel: 'Módulo',
                descriptionLabel: 'Descripción',
                save: 'Guardar cambios',
              },
              noDescription: 'Sin descripción registrada todavía.',
            },
            assets: {
              title: 'Recursos',
              transcribe: 'Transcribir audio',
              modelLabel: 'Modelo',
              model: {
                tiny: 'tiny',
                base: 'base',
                small: 'small',
                medium: 'medium',
                large: 'large',
                gpu: 'GPU (acelerado por hardware)',
              },
              labels: {
                audio: 'Audio (.wav, .mp3, .m4a, .aac, .flac, .ogg, .opus)',
                masteredAudio: 'Audio masterizado',
                slides: 'Diapositivas (PDF)',
                transcript: 'Transcripción',
                notes: 'Notas',
                slideBundle: 'Paquete de diapositivas (Markdown + ZIP)',
              },
              status: {
                notLinked: 'Sin vincular',
                slidesHint: 'Carga un PDF y luego procésalo para generar el paquete Markdown.',
                noSlideImages: 'Aún no hay paquete de diapositivas. Usa “Procesar diapositivas” después de subir un PDF.',
                linked: 'Vinculado: {{name}}',
                slidesUploaded: 'Diapositivas subidas: {{name}}',
                archiveCreated: 'Paquete creado: {{name}}',
                mastered: 'Masterizado: {{name}}',
              },
              actions: {
                upload: 'Subir',
                processSlides: 'Procesar diapositivas',
                download: 'Descargar',
                remove: 'Eliminar',
              },
            },
            progress: {
              title: 'Cola de procesamiento',
              description: 'Supervisa las conversiones, masterizaciones y transcripciones en ejecución.',
              empty: 'No hay tareas activas.',
              refresh: 'Actualizar',
              retry: 'Reintentar',
              dismiss: 'Descartar',
              openLecture: 'Abrir clase',
              status: {
                running: 'En progreso',
                finished: 'Completado',
                error: 'Requiere atención',
              },
              labels: {
                transcription: 'Transcripción',
                slideBundle: 'Paquete de diapositivas',
                audioMastering: 'Masterización de audio',
                processing: 'Tarea de procesamiento',
                untitled: 'Clase sin título',
              },
              retryUnavailable: 'No es posible reintentar esta tarea.',
            },
            create: {
              title: 'Crear clase',
              moduleLabel: 'Módulo',
              titleLabel: 'Título',
              descriptionLabel: 'Descripción',
              submit: 'Agregar clase',
            },
            settings: {
              title: 'Configuración',
              appearance: {
                legend: 'Apariencia',
                themeLabel: 'Tema',
                theme: {
                  system: 'Seguir sistema',
                  light: 'Claro',
                  dark: 'Oscuro',
                },
              },
              language: {
                label: 'Idioma',
                choices: {
                  en: 'English (Inglés)',
                  zh: '中文 (Chino)',
                  es: 'Español',
                  fr: 'Français (Francés)',
                },
              },
              debug: {
                legend: 'Depuración',
                enable: 'Activar modo de depuración',
                description:
                  'Muestra en la derecha una consola en vivo con la salida detallada del programa.',
              },
              whisper: {
                legend: 'Transcripción Whisper',
                modelLabel: 'Modelo predeterminado',
                model: {
                  tiny: 'Tiny (más rápido)',
                  base: 'Base (equilibrado)',
                  small: 'Small (preciso)',
                  medium: 'Medium (detallado)',
                  large: 'Large (máxima precisión)',
                  gpu: 'GPU (acelerado por hardware)',
                },
                computeLabel: 'Tipo de cómputo',
                beamLabel: 'Tamaño de haz',
                gpu: {
                  label: 'Compatibilidad con GPU',
                  status: 'Aceleración GPU no probada.',
                  test: 'Probar compatibilidad',
                  retry: 'Volver a probar',
                },
              },
              audio: {
                legend: 'Audio',
                masteringLabel: 'Habilitar audio masterizado',
                masteringDescription: 'Mejora automáticamente el audio subido para mayor claridad.',
              },
              slides: {
                legend: 'Diapositivas',
                dpiLabel: 'DPI de renderizado',
                dpi: {
                  150: '150 dpi (más rápido)',
                  200: '200 dpi (equilibrado)',
                  300: '300 dpi (detallado)',
                  400: '400 dpi (alto detalle)',
                  600: '600 dpi (máximo)',
                },
              },
              update: {
                legend: 'Actualizaciones del sistema',
                description: 'Actualiza Lecture Tools sin salir del navegador.',
                run: 'Ejecutar actualización',
                refresh: 'Actualizar estado',
                status: {
                  idle: 'No hay ninguna actualización en curso.',
                  running: 'Actualización en curso. Mantén esta ventana abierta hasta que termine.',
                  success: 'La actualización más reciente se completó correctamente.',
                  failure: 'La actualización más reciente tuvo un error.',
                },
                startedAt: 'Inició {{time}}.',
                finishedAt: 'Finalizó {{time}}.',
                exitCode: 'Código de salida {{code}}.',
                logLabel: 'Registro de actividad',
                logEmpty: 'Aún no hay actividad de actualización.',
              },
              archive: {
                legend: 'Archivo',
                description:
                  'Exporta tus clases y recursos o importa un archivo desde otro equipo.',
                export: 'Exportar archivo',
                import: 'Importar archivo',
                modeLabel: 'Modo de importación',
                modes: {
                  merge: 'Agregar al contenido existente',
                  replace: 'Borrar el contenido actual y sobrescribir',
                },
                hint: 'Los archivos exportados se guardan temporalmente y se eliminan al iniciar la aplicación.',
              },
              save: 'Guardar configuración',
              exit: 'Salir de la aplicación',
            },
            storage: {
              title: 'Administrador de almacenamiento',
              subtitle: 'Revisa los recursos almacenados según la estructura de clases.',
              loading: 'Cargando…',
              empty: 'No se encontraron clases con almacenamiento.',
              usage: {
                used: 'En uso',
                available: 'Disponible',
                total: 'Total',
              },
              actions: {
                refresh: 'Actualizar',
                downloadSelected: 'Descargar seleccionados',
                purge: 'Quitar audio procesado',
              },
              browser: {
                root: 'Raíz',
                up: 'Subir',
                loading: 'Cargando…',
                empty: 'No hay archivos ni carpetas en esta ubicación.',
                select: 'Seleccionar',
                name: 'Nombre',
                type: 'Tipo',
                size: 'Tamaño',
                modified: 'Modificado',
                actions: 'Acciones',
                directory: 'Carpeta',
                file: 'Archivo',
                unnamed: 'Elemento sin nombre',
                selectAction: 'Seleccionar {{name}}',
              },
              purge: {
                none: 'No hay audio procesado para eliminar.',
                available: '{{count}} {{lectureWord}} listos para limpiar.',
                working: 'Eliminando audio…',
                readyCount: '{{count}} {{lectureWord}} listos para limpiar',
              },
              classes: {
                summary: '{{moduleCount}} {{moduleWord}} • {{lectureCount}} {{lectureWord}}',
                empty: 'Esta clase no tiene módulos almacenados.',
                masteredCount: '{{count}} {{lectureWord}} con audio masterizado',
              },
              modules: {
                summary: '{{lectureCount}} {{lectureWord}}',
                empty: 'Este módulo no tiene clases almacenadas.',
                masteredCount: '{{count}} {{lectureWord}} con audio masterizado',
              },
              lecture: {
                audio: 'Audio',
                processedAudio: 'Audio masterizado',
                transcript: 'Transcripción',
                notes: 'Notas',
                slides: 'Diapositivas',
                empty: 'Sin recursos vinculados.',
                eligible: 'Audio listo para eliminarse',
                processedBadge: 'Audio masterizado',
              },
              dialogs: {
                purgeTitle: 'Quitar audio procesado',
                purgeMessage:
                  '¿Eliminar los archivos de audio de {{count}} {{lectureWord}} que ya tienen transcripción? Esta acción no se puede deshacer.',
                deleteTitle: 'Eliminar elemento de almacenamiento',
                deleteMessage: '¿Eliminar “{{name}}”? Esta acción no se puede deshacer.',
                deleteConfirm: 'Eliminar',
              },
              unnamedClass: 'Clase sin nombre',
              unnamedModule: 'Módulo sin nombre',
              unnamedLecture: 'Sesión sin nombre',
            },
            debug: {
              title: 'Consola de depuración',
              live: 'En vivo',
              empty:
                'Activa el modo de depuración para ver la actividad del programa en tiempo real.',
              error: 'No se pudo cargar la salida de depuración.',
              stream: {
                title: 'Actividad del servidor',
                empty: 'Esperando actividad del servidor…',
              },
            },
            dialog: {
              cancel: 'Cancelar',
              confirm: 'Confirmar',
            },
            stats: {
              classes: 'Cursos',
              modules: 'Módulos',
              lectures: 'Clases',
              transcripts: 'Transcripciones',
              slideDecks: 'Presentaciones',
              audio: 'Archivos de audio',
              processedAudio: 'Audio masterizado',
              notes: 'Notas',
              slideArchives: 'Paquetes de diapositivas',
            },
            dialogs: {
              createClass: {
                title: 'Crear curso',
                message: 'Ingresa un nombre de curso.',
                placeholder: 'Introducción a la astronomía',
              },
              createModule: {
                title: 'Crear módulo',
                message: 'Nombre del módulo para {{className}}',
                placeholder: 'Fundamentos',
              },
              createLecture: {
                title: 'Crear clase',
                message: 'Título de la clase para {{context}}',
                placeholder: 'Título de la clase',
              },
              lectureDescription: {
                title: 'Descripción de la clase',
                placeholder: 'Agrega un esquema breve…',
              },
              deleteClass: {
                title: 'Eliminar curso',
                message: '¿Eliminar el curso "{{className}}"?',
                cancel: 'Conservar curso',
                summary: 'Esto eliminará {{moduleCount}} {{moduleWord}} y {{lectureCount}} {{lectureWord}}.',
              },
              deleteModule: {
                title: 'Eliminar módulo',
                message: '¿Eliminar el módulo "{{moduleName}}"{{classContext}}?',
                cancel: 'Conservar módulo',
                summary: 'Esto eliminará {{lectureCount}} {{lectureWord}}.',
                classContext: ' del curso "{{className}}"',
              },
              deleteLecture: {
                title: 'Eliminar clase',
                message: '¿Eliminar la clase "{{context}}" y todos los recursos vinculados?',
                cancel: 'Conservar clase',
              },
              removeAsset: {
                title: 'Eliminar {{asset}}',
                message: '¿Quieres eliminar el {{asset}} actual de esta clase? Esta acción no se puede deshacer.',
                confirm: 'Eliminar recurso',
              },
              confirmDeletion: {
                title: 'Confirmar eliminación',
                message: 'Esta acción no se puede deshacer. ¿Deseas eliminarla permanentemente?',
                confirm: 'Sí, eliminar',
              },
              gpuWhisper: {
                title: 'GPU Whisper',
              },
              exitApp: {
                title: 'Salir de la aplicación',
                message: '¿Detener el servidor de Lecture Tools y cerrar esta pestaña?',
              },
              slideRange: {
                title: 'Seleccionar páginas a procesar',
                description:
                  'Revisa las miniaturas de las diapositivas y elige qué páginas convertir.',
                loading: 'Cargando vista previa…',
                error:
                  'Se muestran abajo las previsualizaciones generadas en el servidor; ajusta el rango manualmente si es necesario.',
                startLabel: 'Página inicial',
                endLabel: 'Página final',
                rangeHint:
                  'Usa los campos o la vista previa para ajustar la selección.',
                zoomLabel: 'Zoom de la vista previa',
                zoomValue: 'Vista al {{value}}%',
                fallbackMessage:
                  'Abre el PDF de abajo en una pestaña nueva si necesitas revisarlo directamente.',
                fallbackLink: 'Abrir PDF en una pestaña nueva',
                fallbackFrameTitle: 'Vista previa de PDF alternativa',
                summary: 'Se procesarán las páginas {{start}}–{{end}} de {{total}}.',
                summarySingle: 'Se procesará la página {{start}} de {{total}}.',
                summaryUnknown: 'Procesando las páginas {{start}}–{{end}}.',
                summarySingleUnknown: 'Procesando la página {{start}}.',
                allPages: 'Se procesarán todas las páginas del documento.',
                pageLabel: 'Página {{page}}',
                selectAll: 'Seleccionar todo',
                confirm: 'Confirmar y continuar',
              },
              upload: {
                title: 'Subir archivo',
                description: 'Arrastra un archivo aquí o examina tu equipo para seleccionarlo.',
                prompt: 'Arrastra y suelta un archivo',
                help: 'También puedes hacer clic para elegir un archivo.',
                browse: 'Seleccionar archivo',
                clear: 'Quitar',
                waiting: 'Selecciona un archivo para continuar.',
                preparing: 'Preparando archivo…',
                uploading: 'Subiendo…',
                processing: 'Procesando carga…',
                processingAction: 'Procesando…',
                processingAudio: 'Procesando audio…',
                processingSlides: 'Procesando diapositivas…',
                backgroundProcessing:
                  'El procesamiento de audio continuará en segundo plano. Puedes cerrar este cuadro de diálogo con seguridad.',
                backgroundProcessingSlides:
                  'La conversión de diapositivas continuará en segundo plano. Puedes cerrar este cuadro de diálogo mientras finaliza.',
                success: 'Subida completada.',
                failure: 'La subida falló. Vuelve a intentarlo.',
                progress: 'Progreso de subida',
                action: 'Subir',
                assetTitle: 'Subir {{asset}}',
                assetDescription: 'Elige un archivo nuevo para este recurso.',
                archiveTitle: 'Importar archivo comprimido',
                archiveDescription: 'Selecciona un archivo exportado de Lecture Tools (.zip).',
              },
              descriptionOptional: 'Descripción (opcional)',
              descriptionPlaceholder: 'Agrega un breve resumen…',
            },
            dropdowns: {
              selectModule: 'Seleccionar módulo…',
              noModules: 'No hay módulos disponibles',
            },
            placeholders: {
              noLectures: 'Sin clases',
              noLecturesFilter: 'Ninguna clase coincide con el filtro actual.',
              noClasses: 'Aún no hay cursos disponibles.',
              noModules: 'Sin módulos por ahora.',
            },
            curriculum: {
              addClass: 'Agregar curso',
              addModule: 'Agregar módulo',
              manageHeading: 'Administrar programa',
              classMeta: '{{moduleCount}} {{moduleWord}} • {{lectureCount}} {{lectureWord}}',
              moduleMeta: '{{lectureCount}} {{lectureWord}}',
            },
            common: {
              actions: {
                create: 'Crear',
                save: 'Guardar',
                skip: 'Omitir',
                delete: 'Eliminar',
                open: 'Abrir',
                upload: 'Subir',
                exit: 'Salir',
                close: 'Cerrar',
                ok: 'Aceptar',
              },
            },
            status: {
              requireEdit: 'Activa el modo edición para gestionar el plan de estudios.',
              requireEditLecture: 'Activa el modo edición para actualizar los detalles.',
              classCreated: 'Curso creado.',
              classRemoved: 'Curso eliminado.',
              moduleCreated: 'Módulo creado.',
              moduleRemoved: 'Módulo eliminado.',
              lectureCreated: 'Clase creada.',
              lectureRemoved: 'Clase eliminada.',
              lectureUpdated: 'Clase actualizada.',
              lectureTitleRequired: 'El título de la clase es obligatorio.',
              createLectureRequirements: 'Selecciona un módulo e ingresa un título.',
              slidesProcessed: 'Diapositivas convertidas en un paquete Markdown con imágenes.',
              slidesUploaded: 'Diapositivas subidas. Procésalas para generar el paquete Markdown.',
              slidesUploadRequired: 'Sube un PDF antes de procesar las diapositivas.',
              slidePreviewFailed: 'No se pudo preparar la vista previa de las diapositivas. Intenta subir el PDF nuevamente.',
              processingSlides: 'Procesando diapositivas…',
              audioProcessingQueued: 'Audio subido. La masterización continuará en segundo plano.',
              assetUploaded: 'Recurso subido correctamente.',
              assetRemoved: 'Recurso eliminado.',
              transcriptionPreparing: '====> Preparando transcripción…',
              transcriptionCompleted: 'Transcripción completada.',
              processing: 'Procesando…',
              storageLoadFailed: 'No se pudieron cargar los contenidos del almacenamiento.',
              storageUsageFailed: 'No se pudo cargar el uso del almacenamiento.',
              storagePurged: 'Audio procesado eliminado.',
              storagePurgeFailed: 'No se pudo eliminar el audio procesado.',
              storageDeleted: 'Elemento de almacenamiento eliminado.',
              storageDeleteFailed: 'No se pudo eliminar el elemento de almacenamiento.',
              storageDownloadReady: 'Descarga preparada.',
              storageDownloadFailed: 'No se pudo preparar la descarga.',
              storageDownloadNone: 'Selecciona al menos un elemento.',
              gpuChecking: '====> Comprobando compatibilidad con GPU Whisper…',
              gpuConfirmed: 'Compatibilidad con GPU Whisper confirmada.',
              gpuUnavailable: 'GPU no disponible en esta plataforma.',
              gpuUnsupported: 'GPU Whisper no es compatible con esta plataforma.',
              gpuNotAvailable: 'La aceleración GPU no está disponible en esta plataforma.',
              updateStarted: 'Actualización iniciada.',
              updateRunning: 'Actualización en curso. Mantén esta ventana abierta.',
              updateCompleted: 'Actualización completada correctamente.',
              updateFailed: 'La actualización falló. Revisa el registro para más detalles.',
              updateConflict: 'Ya hay una actualización en curso.',
              shuttingDown: 'Cerrando la aplicación…',
              settingsSaved: 'Configuración guardada.',
              gpuFallback: 'Se usará el modelo {{model}}.',
              lectureReordered: 'El orden de las clases se actualizó.',
              exporting: 'Preparando archivo…',
              exportReady: 'Archivo listo para descargar.',
              exportFailed: 'No se pudo crear el archivo.',
              importing: 'Importando archivo…',
              importSuccess: 'Se importaron {{count}} clases.',
              importNoChanges: 'Archivo importado (sin clases nuevas).',
            },
            counts: {
              module: { one: 'módulo', other: 'módulos' },
              lecture: { one: 'clase', other: 'clases' },
            },
          },
          fr: {
            document: {
              title: 'Outils de cours',
            },
            sidebar: {
              heading: 'Outils de cours',
              tagline: 'Passez en revue, organisez et traitez rapidement les ressources de cours.',
              overview: 'Vue d’ensemble',
              syllabusTitle: 'Plan de cours',
              searchLabel: 'Rechercher dans le plan',
              searchPlaceholder: 'Rechercher par nom',
              loading: 'Chargement…',
            },
            topBar: {
              details: 'Détails',
              enableEdit: 'Activer le mode édition',
              exitEdit: 'Quitter le mode édition',
              progress: 'Progression',
              create: 'Créer',
              storage: 'Stockage',
              settings: 'Paramètres',
            },
            details: {
              title: 'Détails du cours',
              deleteLecture: 'Supprimer le cours',
              editModeBanner:
                'Le mode édition est activé. Mettez à jour les informations ou supprimez des éléments pendant qu’il est actif.',
              summaryPlaceholder: 'Sélectionnez un cours dans le programme.',
              edit: {
                titleLabel: 'Titre',
                moduleLabel: 'Module',
                descriptionLabel: 'Description',
                save: 'Enregistrer les modifications',
              },
              noDescription: 'Aucune description enregistrée pour le moment.',
            },
            assets: {
              title: 'Ressources',
              transcribe: 'Transcrire l’audio',
              modelLabel: 'Modèle',
              model: {
                tiny: 'tiny',
                base: 'base',
                small: 'small',
                medium: 'medium',
                large: 'large',
                gpu: 'GPU (accélération matérielle)',
              },
              labels: {
                audio: 'Audio (.wav, .mp3, .m4a, .aac, .flac, .ogg, .opus)',
                masteredAudio: 'Audio masterisé',
                slides: 'Diapositives (PDF)',
                transcript: 'Transcription',
                notes: 'Notes',
                slideBundle: 'Archive de diapositives (Markdown + ZIP)',
              },
              status: {
                notLinked: 'Non lié',
                slidesHint: 'Importez un PDF puis traitez-le pour générer l’archive Markdown.',
                noSlideImages: 'Aucune archive de diapositives. Utilisez « Traiter les diapositives » après avoir importé un PDF.',
                linked: 'Lié : {{name}}',
                slidesUploaded: 'Diapositives importées : {{name}}',
                archiveCreated: 'Archive créée : {{name}}',
                mastered: 'Masterisé : {{name}}',
              },
              actions: {
                upload: 'Importer',
                processSlides: 'Traiter les diapositives',
                download: 'Télécharger',
                remove: 'Supprimer',
              },
            },
            progress: {
              title: 'File de traitement',
              description: 'Suivez les conversions, la masterisation et les transcriptions en cours.',
              empty: 'Aucune tâche en cours.',
              refresh: 'Actualiser',
              retry: 'Réessayer',
              dismiss: 'Ignorer',
              openLecture: 'Ouvrir la leçon',
              status: {
                running: 'En cours',
                finished: 'Terminé',
                error: 'Nécessite une attention',
              },
              labels: {
                transcription: 'Transcription',
                slideBundle: 'Archive de diapositives',
                audioMastering: 'Masterisation audio',
                processing: 'Tâche de traitement',
                untitled: 'Leçon sans titre',
              },
              retryUnavailable: 'Impossible de relancer cette tâche.',
            },
            create: {
              title: 'Créer un cours',
              moduleLabel: 'Module',
              titleLabel: 'Titre',
              descriptionLabel: 'Description',
              submit: 'Ajouter le cours',
            },
            settings: {
              title: 'Paramètres',
              appearance: {
                legend: 'Apparence',
                themeLabel: 'Thème',
                theme: {
                  system: 'Suivre le système',
                  light: 'Clair',
                  dark: 'Sombre',
                },
              },
              language: {
                label: 'Langue',
                choices: {
                  en: 'English (Anglais)',
                  zh: '中文 (Chinois)',
                  es: 'Español (Espagnol)',
                  fr: 'Français',
                },
              },
              debug: {
                legend: 'Débogage',
                enable: 'Activer le mode débogage',
                description:
                  'Affiche sur la droite une console en direct avec la sortie détaillée du programme.',
              },
              whisper: {
                legend: 'Transcription Whisper',
                modelLabel: 'Modèle par défaut',
                model: {
                  tiny: 'Tiny (plus rapide)',
                  base: 'Base (équilibré)',
                  small: 'Small (précis)',
                  medium: 'Medium (détaillé)',
                  large: 'Large (précision maximale)',
                  gpu: 'GPU (accélération matérielle)',
                },
                computeLabel: 'Type de calcul',
                beamLabel: 'Taille du faisceau',
                gpu: {
                  label: 'Prise en charge GPU',
                  status: 'Accélération GPU non testée.',
                  test: 'Tester la prise en charge',
                  retry: 'Relancer le test',
                },
              },
              audio: {
                legend: 'Audio',
                masteringLabel: 'Activer l’audio optimisé',
                masteringDescription: 'Améliore automatiquement l’audio importé pour une meilleure clarté.',
              },
              slides: {
                legend: 'Diapositives',
                dpiLabel: 'DPI de rendu',
                dpi: {
                  150: '150 dpi (plus rapide)',
                  200: '200 dpi (équilibré)',
                  300: '300 dpi (détaillé)',
                  400: '400 dpi (très détaillé)',
                  600: '600 dpi (maximum)',
                },
              },
              update: {
                legend: 'Mises à jour du système',
                description: 'Mettez Lecture Tools à jour sans quitter le navigateur.',
                run: 'Lancer la mise à jour',
                refresh: 'Actualiser l’état',
                status: {
                  idle: 'Aucune mise à jour en cours.',
                  running: 'Mise à jour en cours. Laissez cette fenêtre ouverte jusqu’à la fin.',
                  success: 'La dernière mise à jour s’est terminée avec succès.',
                  failure: 'La dernière mise à jour a rencontré une erreur.',
                },
                startedAt: 'Démarrée {{time}}.',
                finishedAt: 'Terminée {{time}}.',
                exitCode: 'Code de sortie {{code}}.',
                logLabel: 'Journal d’activité',
                logEmpty: 'Aucune activité de mise à jour pour le moment.',
              },
              archive: {
                legend: 'Archive',
                description:
                  'Exportez vos cours et ressources ou importez une archive depuis une autre machine.',
                export: 'Exporter l’archive',
                import: 'Importer une archive',
                modeLabel: 'Mode d’importation',
                modes: {
                  merge: 'Ajouter au contenu existant',
                  replace: 'Effacer le contenu actuel puis écraser',
                },
                hint: 'Les archives exportées sont conservées temporairement et supprimées au démarrage de l’application.',
              },
              save: 'Enregistrer les paramètres',
              exit: 'Quitter l’application',
            },
            storage: {
              title: 'Gestionnaire de stockage',
              subtitle: 'Consultez les ressources stockées selon la structure des cours.',
              loading: 'Chargement…',
              empty: 'Aucune classe stockée trouvée.',
              usage: {
                used: 'Utilisé',
                available: 'Disponible',
                total: 'Total',
              },
              actions: {
                refresh: 'Actualiser',
                downloadSelected: 'Télécharger la sélection',
                purge: 'Supprimer l’audio traité',
              },
              browser: {
                root: 'Racine',
                up: 'Dossier parent',
                loading: 'Chargement…',
                empty: 'Aucun fichier ou dossier à cet emplacement.',
                select: 'Sélectionner',
                name: 'Nom',
                type: 'Type',
                size: 'Taille',
                modified: 'Modifié',
                actions: 'Actions',
                directory: 'Dossier',
                file: 'Fichier',
                unnamed: 'Élément sans nom',
                selectAction: 'Sélectionner {{name}}',
              },
              purge: {
                none: 'Aucun audio traité à supprimer.',
                available: '{{count}} {{lectureWord}} prêts à nettoyer.',
                working: 'Suppression des audios…',
                readyCount: '{{count}} {{lectureWord}} prêts à nettoyer',
              },
              classes: {
                summary: '{{moduleCount}} {{moduleWord}} • {{lectureCount}} {{lectureWord}}',
                empty: 'Ce cours n’a pas encore de modules stockés.',
                masteredCount: '{{count}} {{lectureWord}} avec audio masterisé',
              },
              modules: {
                summary: '{{lectureCount}} {{lectureWord}}',
                empty: 'Ce module n’a pas encore de séances stockées.',
                masteredCount: '{{count}} {{lectureWord}} avec audio masterisé',
              },
              lecture: {
                audio: 'Audio',
                processedAudio: 'Audio masterisé',
                transcript: 'Transcription',
                notes: 'Notes',
                slides: 'Diapositives',
                empty: 'Aucune ressource liée.',
                eligible: 'Audio prêt à être supprimé',
                processedBadge: 'Audio masterisé',
              },
              dialogs: {
                purgeTitle: 'Supprimer l’audio traité',
                purgeMessage:
                  'Supprimer les fichiers audio de {{count}} {{lectureWord}} déjà transcrites ? Cette action est irréversible.',
                deleteTitle: 'Supprimer l’élément de stockage',
                deleteMessage: 'Supprimer « {{name}} » ? Cette action est irréversible.',
                deleteConfirm: 'Supprimer',
              },
              unnamedClass: 'Cours sans nom',
              unnamedModule: 'Module sans nom',
              unnamedLecture: 'Séance sans nom',
            },
            debug: {
              title: 'Console de débogage',
              live: 'En direct',
              empty:
                "Activez le mode débogage pour suivre l’activité du programme en temps réel.",
              error: 'Impossible de charger la sortie de débogage.',
              stream: {
                title: 'Activité du serveur',
                empty: 'En attente d’activité du serveur…',
              },
            },
            dialog: {
              cancel: 'Annuler',
              confirm: 'Confirmer',
            },
            stats: {
              classes: 'Cours',
              modules: 'Modules',
              lectures: 'Leçons',
              transcripts: 'Transcriptions',
              slideDecks: 'Présentations',
              audio: 'Fichiers audio',
              processedAudio: 'Audio masterisé',
              notes: 'Notes',
              slideArchives: 'Paquets de diapositives',
            },
            dialogs: {
              createClass: {
                title: 'Créer un cours',
                message: 'Saisissez le nom du cours.',
                placeholder: 'Introduction à l’astronomie',
              },
              createModule: {
                title: 'Créer un module',
                message: 'Nom du module pour {{className}}',
                placeholder: 'Fondements',
              },
              createLecture: {
                title: 'Créer une leçon',
                message: 'Titre de la leçon pour {{context}}',
                placeholder: 'Titre de la leçon',
              },
              lectureDescription: {
                title: 'Description de la leçon',
                placeholder: 'Ajoutez un court aperçu…',
              },
              deleteClass: {
                title: 'Supprimer le cours',
                message: 'Supprimer le cours « {{className}} » ?',
                cancel: 'Conserver le cours',
                summary: 'Cette action supprimera {{moduleCount}} {{moduleWord}} et {{lectureCount}} {{lectureWord}}.',
              },
              deleteModule: {
                title: 'Supprimer le module',
                message: 'Supprimer le module « {{moduleName}} »{{classContext}} ?',
                cancel: 'Conserver le module',
                summary: 'Cette action supprimera {{lectureCount}} {{lectureWord}}.',
                classContext: ' du cours « {{className}} »',
              },
              deleteLecture: {
                title: 'Supprimer la leçon',
                message: 'Supprimer la leçon « {{context}} » et toutes les ressources associées ?',
                cancel: 'Conserver la leçon',
              },
              removeAsset: {
                title: 'Supprimer {{asset}}',
                message: 'Supprimer la ressource {{asset}} de cette leçon ? Cette action est irréversible.',
                confirm: 'Supprimer la ressource',
              },
              confirmDeletion: {
                title: 'Confirmer la suppression',
                message: 'Cette action est irréversible. Souhaitez-vous la supprimer définitivement ?',
                confirm: 'Oui, supprimer',
              },
              gpuWhisper: {
                title: 'GPU Whisper',
              },
              exitApp: {
                title: 'Quitter l’application',
                message: 'Arrêter le serveur Lecture Tools et fermer cet onglet ?',
              },
              slideRange: {
                title: 'Sélectionner les pages à traiter',
                description:
                  'Parcourez les miniatures des diapositives ci-dessous et choisissez les pages à convertir en images.',
                loading: 'Chargement de l’aperçu…',
                error:
                  'Les aperçus générés par le serveur sont affichés ci-dessous ; ajustez la plage manuellement si nécessaire.',
                startLabel: 'Page de début',
                endLabel: 'Page de fin',
                rangeHint: 'Utilisez les champs ou l’aperçu pour ajuster la sélection.',
                zoomLabel: 'Zoom de l’aperçu',
                zoomValue: 'Vue à {{value}} %',
                fallbackMessage:
                  'Ouvrez le PDF ci-dessous dans un nouvel onglet si vous devez l’examiner directement.',
                fallbackLink: 'Ouvrir le PDF dans un nouvel onglet',
                fallbackFrameTitle: 'Aperçu PDF de secours',
                summary: 'Traitement des pages {{start}} à {{end}} sur {{total}}.',
                summarySingle: 'Traitement de la page {{start}} sur {{total}}.',
                summaryUnknown: 'Traitement des pages {{start}} à {{end}}.',
                summarySingleUnknown: 'Traitement de la page {{start}}.',
                allPages: 'Traitement de toutes les pages du document.',
                pageLabel: 'Page {{page}}',
                selectAll: 'Tout sélectionner',
                confirm: 'Confirmer et continuer',
              },
              upload: {
                title: 'Téléverser un fichier',
                description:
                  'Glissez un fichier ici ou parcourez votre ordinateur pour le sélectionner.',
                prompt: 'Glissez-déposez un fichier',
                help: 'Vous pouvez aussi cliquer pour choisir un fichier.',
                browse: 'Sélectionner un fichier',
                clear: 'Retirer',
                waiting: 'Sélectionnez un fichier pour continuer.',
                preparing: 'Préparation du fichier…',
                uploading: 'Téléversement…',
                processing: 'Traitement du téléversement…',
                processingAction: 'Traitement…',
                processingAudio: 'Traitement de l’audio…',
                processingSlides: 'Traitement des diapositives…',
                backgroundProcessing:
                  'Le traitement audio se poursuit en arrière-plan. Vous pouvez fermer cette boîte de dialogue en toute sécurité.',
                backgroundProcessingSlides:
                  'La conversion des diapositives se poursuit en arrière-plan. Vous pouvez fermer cette boîte de dialogue pendant le traitement.',
                success: 'Téléversement terminé.',
                failure: 'Le téléversement a échoué. Réessayez.',
                progress: 'Progression du téléversement',
                action: 'Téléverser',
                assetTitle: 'Téléverser {{asset}}',
                assetDescription: 'Choisissez un nouveau fichier à associer à cette ressource.',
                archiveTitle: 'Importer une archive',
                archiveDescription: 'Sélectionnez une archive Lecture Tools exportée (.zip).',
              },
              descriptionOptional: 'Description (optionnel)',
              descriptionPlaceholder: 'Ajoutez un court résumé…',
            },
            dropdowns: {
              selectModule: 'Sélectionner un module…',
              noModules: 'Aucun module disponible',
            },
            placeholders: {
              noLectures: 'Aucune leçon',
              noLecturesFilter: 'Aucune leçon ne correspond au filtre actuel.',
              noClasses: 'Aucun cours disponible pour le moment.',
              noModules: 'Aucun module pour le moment.',
            },
            curriculum: {
              addClass: 'Ajouter un cours',
              addModule: 'Ajouter un module',
              manageHeading: 'Gérer le plan de cours',
              classMeta: '{{moduleCount}} {{moduleWord}} • {{lectureCount}} {{lectureWord}}',
              moduleMeta: '{{lectureCount}} {{lectureWord}}',
            },
            common: {
              actions: {
                create: 'Créer',
                save: 'Enregistrer',
                skip: 'Ignorer',
                delete: 'Supprimer',
                open: 'Ouvrir',
                upload: 'Importer',
                exit: 'Quitter',
                close: 'Fermer',
                ok: 'OK',
              },
            },
            status: {
              requireEdit: 'Activez le mode édition pour gérer le programme.',
              requireEditLecture: 'Activez le mode édition pour mettre à jour les détails.',
              classCreated: 'Cours créé.',
              classRemoved: 'Cours supprimé.',
              moduleCreated: 'Module créé.',
              moduleRemoved: 'Module supprimé.',
              lectureCreated: 'Leçon créée.',
              lectureRemoved: 'Leçon supprimée.',
              lectureUpdated: 'Leçon mise à jour.',
              lectureTitleRequired: 'Le titre de la leçon est requis.',
              createLectureRequirements: 'Sélectionnez un module et saisissez un titre.',
              slidesProcessed: 'Diapositives converties en archive Markdown avec images.',
              slidesUploaded: 'Diapositives importées. Traitez-les pour générer l’archive Markdown.',
              slidesUploadRequired: 'Importez un PDF avant de traiter les diapositives.',
              slidePreviewFailed: 'Impossible de préparer l’aperçu des diapositives. Réessayez en important le PDF à nouveau.',
              processingSlides: 'Traitement des diapositives…',
              audioProcessingQueued: 'Audio téléversé. Le mastering se poursuit en arrière-plan.',
              assetUploaded: 'Ressource importée avec succès.',
              assetRemoved: 'Ressource supprimée.',
              transcriptionPreparing: '====> Préparation de la transcription…',
              transcriptionCompleted: 'Transcription terminée.',
              processing: 'Traitement…',
              storageLoadFailed: 'Impossible de charger le contenu du stockage.',
              storageUsageFailed: 'Impossible de charger l’utilisation du stockage.',
              storagePurged: 'Audios traités supprimés.',
              storagePurgeFailed: 'Impossible de supprimer les audios traités.',
              storageDeleted: 'Élément de stockage supprimé.',
              storageDeleteFailed: 'Impossible de supprimer l’élément de stockage.',
              storageDownloadReady: 'Téléchargement prêt.',
              storageDownloadFailed: 'Impossible de préparer le téléchargement.',
              storageDownloadNone: 'Sélectionnez au moins un élément.',
              gpuChecking: '====> Vérification de la compatibilité GPU Whisper…',
              gpuConfirmed: 'Compatibilité GPU Whisper confirmée.',
              gpuUnavailable: 'GPU indisponible sur cette plateforme.',
              gpuUnsupported: 'GPU Whisper n’est pas pris en charge sur cette plateforme.',
              gpuNotAvailable: 'L’accélération GPU n’est pas disponible sur cette plateforme.',
              updateStarted: 'Mise à jour lancée.',
              updateRunning: 'Mise à jour en cours. Laissez cette fenêtre ouverte.',
              updateCompleted: 'Mise à jour terminée avec succès.',
              updateFailed: 'Échec de la mise à jour. Consultez le journal pour plus de détails.',
              updateConflict: 'Une mise à jour est déjà en cours.',
              shuttingDown: 'Fermeture de l’application…',
              settingsSaved: 'Paramètres enregistrés.',
              gpuFallback: 'Bascule vers le modèle {{model}}.',
              lectureReordered: 'L’ordre des cours a été mis à jour.',
              exporting: 'Préparation de l’archive…',
              exportReady: 'Archive prête au téléchargement.',
              exportFailed: 'Impossible de créer l’archive.',
              importing: 'Importation de l’archive…',
              importSuccess: '{{count}} cours importés.',
              importNoChanges: 'Archive importée (aucun nouveau cours).',
            },
            counts: {
              module: { one: 'module', other: 'modules' },
              lecture: { one: 'leçon', other: 'leçons' },
            },
          },
        };

        const DEFAULT_LANGUAGE = 'en';

        function normalizeServerPath(value) {
          if (typeof value !== 'string') {
            return null;
          }
          const sentinel = '__LECTURE_TOOLS_ROOT_PATH__';
          if (value === sentinel) {
            return null;
          }
          let normalized = value.trim();
          if (!normalized || normalized === '/') {
            return '';
          }
          if (!normalized.startsWith('/')) {
            normalized = `/${normalized}`;
          }
          return normalized.replace(/\/+$/, '') || '';
        }

        const BASE_PATH = (() => {
          const serverPath = normalizeServerPath(
            window.__LECTURE_TOOLS_SERVER_ROOT_PATH__,
          );
          if (serverPath !== null) {
            return serverPath;
          }
          const { pathname } = window.location;
          if (!pathname || pathname === '/' || pathname === '/index.html') {
            return '';
          }
          const withoutIndex = pathname.replace(/\/index\.html?$/, '');
          const trimmed = withoutIndex.endsWith('/')
            ? withoutIndex.slice(0, -1)
            : withoutIndex;
          return trimmed === '/' ? '' : trimmed;
        })();

        window.__LECTURE_TOOLS_BASE_PATH__ = BASE_PATH;

        function resolveAppUrl(target) {
          if (!target || typeof target !== 'string') {
            return target;
          }
          if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target) || target.startsWith('//')) {
            return target;
          }
          if (target.startsWith('#') || target.startsWith('?')) {
            return target;
          }
          const normalized = target.startsWith('/') ? target : `/${target}`;
          if (!BASE_PATH) {
            return normalized;
          }
          if (normalized === '/') {
            return BASE_PATH || '/';
          }
          return `${BASE_PATH}${normalized}`;
        }

        function resolveTranslation(locale, key) {
          if (!locale || !key) {
            return undefined;
          }
          const segments = key.split('.');
          let value = locale;
          for (const segment of segments) {
            if (value && Object.prototype.hasOwnProperty.call(value, segment)) {
              value = value[segment];
            } else {
              return undefined;
            }
          }
          return typeof value === 'string' || (typeof value === 'object' && value !== null)
            ? value
            : undefined;
        }

        function formatTemplate(template, params) {
          if (!params) {
            return template;
          }
          return template.replace(/\{\{(.*?)\}\}/g, (match, name) => {
            const key = String(name).trim();
            return Object.prototype.hasOwnProperty.call(params, key)
              ? String(params[key])
              : match;
          });
        }

        function getLocale(language) {
          return translations[language] ?? translations[DEFAULT_LANGUAGE];
        }

        let currentLanguage = DEFAULT_LANGUAGE;

        function t(key, params = undefined) {
          if (!key) {
            return '';
          }
          const locale = getLocale(currentLanguage);
          const fallback = translations[DEFAULT_LANGUAGE];
          const template =
            resolveTranslation(locale, key) ?? resolveTranslation(fallback, key) ?? key;
          return formatTemplate(template, params);
        }

        const pluralRules = {
          en: new Intl.PluralRules('en'),
          zh: new Intl.PluralRules('zh'),
          es: new Intl.PluralRules('es'),
          fr: new Intl.PluralRules('fr'),
        };

        function pluralize(language, key, count) {
          const locale = getLocale(language);
          const fallback = translations[DEFAULT_LANGUAGE];
          const rule = (pluralRules[language] ?? pluralRules[DEFAULT_LANGUAGE]).select(
            Number(count),
          );
          const target = resolveTranslation(locale, key);
          const fallbackTarget = resolveTranslation(fallback, key);
          if (target && typeof target === 'string') {
            return target;
          }
          if (target && typeof target === 'object' && target !== null) {
            return target[rule] ?? target.other ?? target.one ?? String(count);
          }
          if (fallbackTarget && typeof fallbackTarget === 'object' && fallbackTarget !== null) {
            return (
              fallbackTarget[rule] ??
              fallbackTarget.other ??
              fallbackTarget.one ??
              String(count)
            );
          }
          return String(count);
        }

        let activeSlideRangeDialog = null;

        function applyTranslations(language) {
          currentLanguage = language && translations[language] ? language : DEFAULT_LANGUAGE;
          const locale = getLocale(currentLanguage);
          const fallback = translations[DEFAULT_LANGUAGE];
          document.documentElement.lang = currentLanguage;

          document.querySelectorAll('[data-i18n]').forEach((element) => {
            const key = element.getAttribute('data-i18n');
            if (!key) {
              return;
            }
            const attr = element.getAttribute('data-i18n-attr');
            const template = resolveTranslation(locale, key) ?? resolveTranslation(fallback, key);
            if (typeof template !== 'string') {
              return;
            }
            if (attr) {
              attr.split(',').forEach((attributeName) => {
                const name = attributeName.trim();
                if (name) {
                  element.setAttribute(name, formatTemplate(template, {}));
                }
              });
            } else {
              element.textContent = formatTemplate(template, {});
            }
          });

          const titleTranslation = resolveTranslation(locale, 'document.title') ??
            resolveTranslation(fallback, 'document.title');
          if (typeof titleTranslation === 'string') {
            document.title = titleTranslation;
          }

          if (activeSlideRangeDialog) {
            activeSlideRangeDialog.updateTexts();
            activeSlideRangeDialog.updateRangeSummary();
          }

          renderProgressQueue();
          renderSystemUpdate();
          if (state.selectedLectureDetail) {
            renderAssets(state.selectedLectureDetail.lecture);
          }
        }

        const WHISPER_MODEL_CHOICES = new Set([
          'tiny',
          'base',
          'small',
          'medium',
          'large',
          'gpu',
        ]);
        const GPU_MODEL = 'gpu';
        const DEFAULT_WHISPER_MODEL = 'base';
        const SLIDE_DPI_CHOICES = new Set(['150', '200', '300', '400', '600']);
        const DEFAULT_SLIDE_DPI = '200';
        const LANGUAGE_CHOICES = new Set(['en', 'zh', 'es', 'fr']);
        const DEBUG_POLL_INTERVAL_MS = 2000;
        const MAX_DEBUG_LOG_ENTRIES = 500;
        const MAX_SERVER_STREAM_ENTRIES = 20;
        const SERVER_LOG_CATEGORY = 'server';
        const UPDATE_POLL_INTERVAL_MS = 3000;

        function normalizeWhisperModel(value) {
          const candidate =
            typeof value === 'string' ? value.trim() : String(value ?? '');
          return WHISPER_MODEL_CHOICES.has(candidate)
            ? candidate
            : DEFAULT_WHISPER_MODEL;
        }

        function normalizeSlideDpi(value) {
          let candidate;
          if (typeof value === 'number' && Number.isFinite(value)) {
            candidate = String(Math.trunc(value));
          } else if (typeof value === 'string') {
            candidate = value.trim();
          } else {
            candidate = String(value ?? '');
          }
          return SLIDE_DPI_CHOICES.has(candidate) ? candidate : DEFAULT_SLIDE_DPI;
        }

        function normalizeLanguage(value) {
          if (typeof value === 'string') {
            const trimmed = value.trim().toLowerCase();
            return LANGUAGE_CHOICES.has(trimmed) ? trimmed : DEFAULT_LANGUAGE;
          }
          return DEFAULT_LANGUAGE;
        }

        const state = {
          classes: [],
          stats: {},
          query: '',
          selectedLectureId: null,
          selectedLectureDetail: null,
          buttonMap: new Map(),
          expandedClasses: new Map(),
          expandedModules: new Map(),
          editMode: false,
          activeView: 'details',
          settings: null,
          draggingLectureId: null,
          draggingSourceModuleId: null,
          draggedElement: null,
          gpuWhisper: {
            supported: false,
            checked: false,
            message: t('settings.whisper.gpu.status'),
            output: '',
            lastChecked: null,
            unavailable: false,
          },
          transcriptionProgressTimer: null,
          transcriptionProgressLectureId: null,
          processingProgressTimer: null,
          processingProgressLectureId: null,
          lastProgressMessage: '',
          lastProgressRatio: null,
          statusHideTimer: null,
          storage: {
            usage: null,
            loading: false,
            overview: null,
            purging: false,
            initialized: false,
            browser: {
              path: '',
              parent: null,
              entries: [],
              loading: false,
              initialized: false,
              deleting: new Set(),
              error: null,
              selected: new Set(),
            },
          },
          progress: {
            entries: [],
            loading: false,
            timer: null,
          },
          systemUpdate: {
            running: false,
            startedAt: null,
            finishedAt: null,
            success: null,
            exitCode: null,
            error: null,
            log: [],
            pollTimer: null,
          },
          transcribeControls: {
            button: null,
            model: null,
            gpuOption: null,
          },
          debug: {
            enabled: false,
            timer: null,
            lastId: 0,
            pending: false,
            autoScroll: true,
            serverEntries: [],
            tasks: [],
            entries: [],
            filters: {
              severity: 'all',
              category: 'all',
              correlationId: '',
              taskId: '',
              query: '',
            },
          },
        };

        function getTranscribeButton() {
          return state.transcribeControls.button;
        }

        function getTranscribeModelSelect() {
          return state.transcribeControls.model;
        }

        function setTranscribeControls(button, model, gpuOption) {
          const current = state.transcribeControls;
          if (current.button && current.button !== button) {
            current.button.removeEventListener('click', handleTranscribeClick);
          }

          if (dom.gpuModelOptions) {
            const existingOption = current.gpuOption;
            if (existingOption && existingOption !== gpuOption) {
              if (dom.gpuModelOptions instanceof Set) {
                dom.gpuModelOptions.delete(existingOption);
              } else if (Array.isArray(dom.gpuModelOptions)) {
                dom.gpuModelOptions = dom.gpuModelOptions.filter(
                  (option) => option !== existingOption,
                );
              }
            }
          }

          state.transcribeControls = {
            button: button || null,
            model: model || null,
            gpuOption: gpuOption || null,
          };

          if (button && current.button !== button) {
            button.addEventListener('click', handleTranscribeClick);
          }

          if (dom.gpuModelOptions && gpuOption) {
            if (dom.gpuModelOptions instanceof Set) {
              dom.gpuModelOptions.add(gpuOption);
            } else if (Array.isArray(dom.gpuModelOptions)) {
              dom.gpuModelOptions.push(gpuOption);
            }
          }

          updateGpuWhisperUI({ ...state.gpuWhisper });
        }

        function setTranscribeButtonDisabled(disabled) {
          const button = getTranscribeButton();
          if (button) {
            button.disabled = Boolean(disabled);
          }
        }

        function setTranscribeModelValue(value) {
          const select = getTranscribeModelSelect();
          if (!select) {
            return;
          }
          select.value = normalizeWhisperModel(value);
        }

        function getTranscribeModelValue() {
          const select = getTranscribeModelSelect();
          if (select && select.value) {
            return normalizeWhisperModel(select.value);
          }
          return state.settings?.whisper_model || DEFAULT_WHISPER_MODEL;
        }

        const dom = {
          status: document.getElementById('status-bar'),
          statusMessage: document.getElementById('status-bar-message'),
          statusProgress: document.getElementById('status-bar-progress'),
          statusProgressFill: document.getElementById('status-bar-progress-fill'),
          statusProgressText: document.getElementById('status-bar-progress-text'),
          stats: document.getElementById('stats'),
          curriculum: document.getElementById('curriculum'),
          search: document.getElementById('search-input'),
          summary: document.getElementById('lecture-summary'),
          editForm: document.getElementById('lecture-edit-form'),
          editName: document.getElementById('edit-lecture-name'),
          editModule: document.getElementById('edit-lecture-module'),
          editDescription: document.getElementById('edit-lecture-description'),
          deleteButton: document.getElementById('delete-lecture'),
          editToggle: document.getElementById('toggle-edit-mode'),
          editBanner: document.getElementById('edit-mode-banner'),
          assetSection: document.getElementById('asset-section'),
          assetList: document.getElementById('asset-list'),
          createForm: document.getElementById('lecture-create-form'),
          createModule: document.getElementById('create-module'),
          createName: document.getElementById('create-name'),
          createDescription: document.getElementById('create-description'),
          createSubmit: document.getElementById('create-submit'),
          viewButtons: Array.from(document.querySelectorAll('.top-bar [data-view]')),
          views: {
            details: document.getElementById('view-details'),
            progress: document.getElementById('view-progress'),
            create: document.getElementById('view-create'),
            storage: document.getElementById('view-storage'),
            settings: document.getElementById('view-settings'),
          },
          sidebarOverview: document.getElementById('sidebar-overview'),
          settingsForm: document.getElementById('settings-form'),
          settingsTheme: document.getElementById('settings-theme'),
          settingsLanguage: document.getElementById('settings-language'),
          settingsWhisperModel: document.getElementById('settings-whisper-model'),
          settingsWhisperCompute: document.getElementById('settings-whisper-compute'),
          settingsWhisperBeam: document.getElementById('settings-whisper-beam'),
          settingsWhisperGpuStatus: document.getElementById('settings-whisper-gpu-status'),
          settingsWhisperGpuTest: document.getElementById('settings-whisper-gpu-test'),
          settingsSlideDpi: document.getElementById('settings-slide-dpi'),
          settingsAudioMastering: document.getElementById('settings-audio-mastering'),
          settingsDebugEnabled: document.getElementById('settings-debug-enabled'),
          settingsExitApp: document.getElementById('settings-exit-app'),
          settingsExport: document.getElementById('settings-export'),
          settingsImport: document.getElementById('settings-import'),
          settingsImportMode: document.getElementById('settings-import-mode'),
          settingsUpdateRun: document.getElementById('settings-update-run'),
          settingsUpdateRefresh: document.getElementById('settings-update-refresh'),
          settingsUpdateStatus: document.getElementById('settings-update-status'),
          settingsUpdateMeta: document.getElementById('settings-update-meta'),
          settingsUpdateLogWrapper: document.getElementById('settings-update-log-wrapper'),
          settingsUpdateLog: document.getElementById('settings-update-log'),
          settingsUpdateLogEmpty: document.getElementById('settings-update-log-empty'),
          gpuModelOptions: new Set(Array.from(document.querySelectorAll('option.gpu-only'))),
          debugPane: document.getElementById('debug-pane'),
          debugLog: document.getElementById('debug-log-window'),
          debugEmpty: document.getElementById('debug-log-empty'),
          debugStatus: document.getElementById('debug-log-status'),
          debugHeartbeat: document.getElementById('debug-heartbeat'),
          debugHeartbeatTrack: document.querySelector('#debug-heartbeat .debug-heartbeat-track'),
          debugStream: document.getElementById('debug-stream-window'),
          debugStreamEntries: document.getElementById('debug-stream-entries'),
          debugStreamEmpty: document.getElementById('debug-stream-empty'),
          debugFilterSeverity: document.getElementById('debug-filter-severity'),
          debugFilterCategory: document.getElementById('debug-filter-category'),
          debugFilterCorrelation: document.getElementById('debug-filter-correlation'),
          debugFilterTask: document.getElementById('debug-filter-task'),
          debugFilterQuery: document.getElementById('debug-filter-query'),
          debugFilterClear: document.getElementById('debug-filter-clear'),
          storage: {
            container: document.getElementById('view-storage'),
            path: document.getElementById('storage-path'),
            refresh: document.getElementById('storage-refresh'),
            downloadSelected: document.getElementById('storage-download-selected'),
            used: document.getElementById('storage-used'),
            available: document.getElementById('storage-available'),
            total: document.getElementById('storage-total'),
            loading: document.getElementById('storage-loading'),
            empty: document.getElementById('storage-empty'),
            wrapper: document.getElementById('storage-class-wrapper'),
            list: document.getElementById('storage-class-list'),
            purge: document.getElementById('storage-purge'),
            purgeSummary: document.getElementById('storage-purge-summary'),
            browser: {
              navRoot: document.getElementById('storage-nav-root'),
              navUp: document.getElementById('storage-nav-up'),
              loading: document.getElementById('storage-browser-loading'),
              empty: document.getElementById('storage-browser-empty'),
              tableWrapper: document.getElementById('storage-browser-table-wrapper'),
              tableBody: document.getElementById('storage-browser-body'),
              selectAll: document.getElementById('storage-select-all'),
            },
          },
          progress: {
            container: document.getElementById('view-progress'),
            list: document.getElementById('progress-list'),
            empty: document.getElementById('progress-empty'),
            refresh: document.getElementById('progress-refresh'),
            description: document.getElementById('progress-description'),
          },
          dialog: {
            root: document.getElementById('dialog-root'),
            backdrop: document.getElementById('dialog-backdrop'),
            window: document.getElementById('dialog-window'),
            title: document.getElementById('dialog-title'),
            message: document.getElementById('dialog-message'),
            inputWrapper: document.getElementById('dialog-input-wrapper'),
            input: document.getElementById('dialog-input'),
            confirm: document.getElementById('dialog-confirm'),
            cancel: document.getElementById('dialog-cancel'),
          },
          pendingDialog: {
            root: document.getElementById('dialog-pending'),
            message: document.getElementById('dialog-pending-message'),
          },
          slideRangeDialog: {
            root: document.getElementById('slide-range-dialog'),
            backdrop: document.getElementById('slide-range-backdrop'),
            window: document.getElementById('slide-range-window'),
            title: document.getElementById('slide-range-title'),
            description: document.getElementById('slide-range-description'),
            preview: document.getElementById('slide-range-preview'),
            loading: document.getElementById('slide-range-loading'),
            error: document.getElementById('slide-range-error'),
            fallback: document.getElementById('slide-range-fallback'),
            fallbackFrame: document.getElementById('slide-range-fallback-frame'),
            fallbackLink: document.getElementById('slide-range-fallback-link'),
            fallbackMessage: document.getElementById('slide-range-fallback-message'),
            pages: document.getElementById('slide-range-pages'),
            startLabel: document.getElementById('slide-range-start-label'),
            endLabel: document.getElementById('slide-range-end-label'),
            startInput: document.getElementById('slide-range-start'),
            endInput: document.getElementById('slide-range-end'),
            selectAll: document.getElementById('slide-range-select-all'),
            zoomLabel: document.getElementById('slide-range-zoom-label'),
            zoomValue: document.getElementById('slide-range-zoom-value'),
            zoomSlider: document.getElementById('slide-range-zoom'),
            hint: document.getElementById('slide-range-hint'),
            summary: document.getElementById('slide-range-summary'),
            confirm: document.getElementById('slide-range-confirm'),
            cancel: document.getElementById('slide-range-cancel'),
          },
          uploadDialog: {
            root: document.getElementById('upload-dialog'),
            backdrop: document.getElementById('upload-dialog-backdrop'),
            window: document.getElementById('upload-dialog-window'),
            title: document.getElementById('upload-dialog-title'),
            description: document.getElementById('upload-dialog-description'),
            dropzone: document.getElementById('upload-dropzone'),
            input: document.getElementById('upload-dialog-input'),
            prompt: document.getElementById('upload-dropzone-prompt'),
            help: document.getElementById('upload-dropzone-help'),
            browse: document.getElementById('upload-browse-button'),
            fileInfo: document.getElementById('upload-file-info'),
            fileName: document.getElementById('upload-file-name'),
            fileSize: document.getElementById('upload-file-size'),
            clear: document.getElementById('upload-clear'),
            progressContainer: document.getElementById('upload-progress-container'),
            progress: document.getElementById('upload-progress'),
            progressFill: document.getElementById('upload-progress-fill'),
            progressText: document.getElementById('upload-progress-text'),
            status: document.getElementById('upload-status-message'),
            cancel: document.getElementById('upload-cancel'),
            confirm: document.getElementById('upload-confirm'),
          },
        };

        const DEFAULT_DEBUG_EMPTY_TEXT = dom.debugEmpty
          ? dom.debugEmpty.textContent || ''
          : '';
        const FILTERED_DEBUG_EMPTY_TEXT = 'No log entries match the current filters.';

        if (dom.debugLog) {
          dom.debugLog.addEventListener('scroll', () => {
            const element = dom.debugLog;
            const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
            state.debug.autoScroll = remaining <= 40;
          });
        }

        if (dom.debugFilterSeverity) {
          dom.debugFilterSeverity.addEventListener('change', (event) => {
            const value = event.target.value || 'all';
            setDebugFilter('severity', value);
          });
        }

        if (dom.debugFilterCategory) {
          dom.debugFilterCategory.addEventListener('change', (event) => {
            const value = event.target.value || 'all';
            setDebugFilter('category', value);
          });
        }

        if (dom.debugFilterCorrelation) {
          dom.debugFilterCorrelation.addEventListener('input', (event) => {
            setDebugFilter('correlationId', event.target.value || '');
          });
        }

        if (dom.debugFilterTask) {
          dom.debugFilterTask.addEventListener('input', (event) => {
            setDebugFilter('taskId', event.target.value || '');
          });
        }

        if (dom.debugFilterQuery) {
          let queryTimer = null;
          dom.debugFilterQuery.addEventListener('input', (event) => {
            window.clearTimeout(queryTimer);
            const value = event.target.value || '';
            queryTimer = window.setTimeout(() => {
              setDebugFilter('query', value);
            }, 120);
          });
        }

        if (dom.debugFilterClear) {
          dom.debugFilterClear.addEventListener('click', () => {
            state.debug.filters = {
              severity: 'all',
              category: 'all',
              correlationId: '',
              taskId: '',
              query: '',
            };
            if (dom.debugFilterSeverity) {
              dom.debugFilterSeverity.value = 'all';
            }
            if (dom.debugFilterCategory) {
              dom.debugFilterCategory.value = 'all';
            }
            if (dom.debugFilterCorrelation) {
              dom.debugFilterCorrelation.value = '';
            }
            if (dom.debugFilterTask) {
              dom.debugFilterTask.value = '';
            }
            if (dom.debugFilterQuery) {
              dom.debugFilterQuery.value = '';
            }
            renderDebugLogs();
          });
        }


        function renderStorageUsage() {
          if (!dom.storage) {
            return;
          }
          const usage = state.storage.usage;
          if (dom.storage.used) {
            dom.storage.used.textContent =
              usage && typeof usage.used === 'number' ? formatBytes(usage.used) : '—';
          }
          if (dom.storage.available) {
            dom.storage.available.textContent =
              usage && typeof usage.free === 'number' ? formatBytes(usage.free) : '—';
          }
          if (dom.storage.total) {
            dom.storage.total.textContent =
              usage && typeof usage.total === 'number' ? formatBytes(usage.total) : '—';
          }
        }

        function renderStoragePurgeSummary() {
          if (!dom.storage || !dom.storage.purgeSummary) {
            return;
          }
          if (state.storage.loading) {
            dom.storage.purgeSummary.textContent = t('storage.loading');
            return;
          }
          const overview = state.storage.overview;
          const eligible = Number(overview?.eligible_audio_total) || 0;
          if (eligible > 0) {
            const lectureWord = pluralize(currentLanguage, 'counts.lecture', eligible);
            dom.storage.purgeSummary.textContent = t('storage.purge.available', {
              count: eligible,
              lectureWord,
            });
          } else {
            dom.storage.purgeSummary.textContent = t('storage.purge.none');
          }
        }

        function renderStoragePurgeControls() {
          if (!dom.storage || !dom.storage.purge) {
            return;
          }
          const overview = state.storage.overview;
          const eligible = Number(overview?.eligible_audio_total) || 0;
          dom.storage.purge.disabled =
            state.storage.loading || state.storage.purging || eligible === 0;
          if (state.storage.purging) {
            dom.storage.purge.textContent = t('storage.purge.working');
          } else {
            dom.storage.purge.textContent = t('storage.actions.purge');
          }
        }

        function renderStorageClasses() {
          if (!dom.storage || !dom.storage.list) {
            return;
          }
          const container = dom.storage.list;
          container.innerHTML = '';
          if (state.storage.loading) {
            return;
          }
          const overview = state.storage.overview;
          const classes = Array.isArray(overview?.classes) ? overview.classes : [];
          classes.forEach((klass) => {
            if (!klass || typeof klass !== 'object') {
              return;
            }
            const classItem = document.createElement('li');
            classItem.className = 'storage-class-card';

            const header = document.createElement('div');
            header.className = 'storage-class-header';

            const title = document.createElement('h3');
            title.className = 'storage-class-title';
            title.textContent = klass.name || t('storage.unnamedClass');
            header.appendChild(title);

            const classSize = document.createElement('span');
            classSize.className = 'storage-class-size';
            classSize.textContent =
              typeof klass.size === 'number' && klass.size >= 0 ? formatBytes(klass.size) : '—';
            header.appendChild(classSize);

            classItem.appendChild(header);

            const moduleCount = Number(klass.module_count) || 0;
            const lectureCount = Number(klass.lecture_count) || 0;
            const moduleWord = pluralize(currentLanguage, 'counts.module', moduleCount);
            const lectureWord = pluralize(currentLanguage, 'counts.lecture', lectureCount);
            const classSummaryParts = [
              t('storage.classes.summary', {
                moduleCount,
                moduleWord,
                lectureCount,
                lectureWord,
              }),
            ];
            const classEligible = Number(klass.eligible_audio_count) || 0;
            if (classEligible > 0) {
              classSummaryParts.push(
                t('storage.purge.readyCount', {
                  count: classEligible,
                  lectureWord: pluralize(currentLanguage, 'counts.lecture', classEligible),
                }),
              );
            }
            const classMastered = Number(klass.processed_audio_count) || 0;
            if (classMastered > 0) {
              classSummaryParts.push(
                t('storage.classes.masteredCount', {
                  count: classMastered,
                  lectureWord: pluralize(currentLanguage, 'counts.lecture', classMastered),
                }),
              );
            }
            const classMeta = document.createElement('p');
            classMeta.className = 'storage-class-meta';
            classMeta.textContent = classSummaryParts.filter(Boolean).join(' • ');
            classItem.appendChild(classMeta);

            const modules = Array.isArray(klass.modules) ? klass.modules : [];
            if (!modules.length) {
              const empty = document.createElement('p');
              empty.className = 'storage-class-meta';
              empty.textContent = t('storage.classes.empty');
              classItem.appendChild(empty);
            } else {
              const moduleList = document.createElement('ul');
              moduleList.className = 'storage-module-list';
              modules.forEach((module) => {
                if (!module || typeof module !== 'object') {
                  return;
                }
                const moduleItem = document.createElement('li');
                moduleItem.className = 'storage-module-card';

                const moduleHeader = document.createElement('div');
                moduleHeader.className = 'storage-module-header';

                const moduleTitle = document.createElement('h4');
                moduleTitle.className = 'storage-module-title';
                moduleTitle.textContent = module.name || t('storage.unnamedModule');
                moduleHeader.appendChild(moduleTitle);

                const moduleSize = document.createElement('span');
                moduleSize.className = 'storage-module-size';
                moduleSize.textContent =
                  typeof module.size === 'number' && module.size >= 0
                    ? formatBytes(module.size)
                    : '—';
                moduleHeader.appendChild(moduleSize);

                moduleItem.appendChild(moduleHeader);

                const moduleLectureCount = Number(module.lecture_count) || 0;
                const moduleLectureWord = pluralize(
                  currentLanguage,
                  'counts.lecture',
                  moduleLectureCount,
                );
                const moduleSummaryParts = [
                  t('storage.modules.summary', {
                    lectureCount: moduleLectureCount,
                    lectureWord: moduleLectureWord,
                  }),
                ];
                const moduleEligible = Number(module.eligible_audio_count) || 0;
                if (moduleEligible > 0) {
                  moduleSummaryParts.push(
                    t('storage.purge.readyCount', {
                      count: moduleEligible,
                      lectureWord: pluralize(currentLanguage, 'counts.lecture', moduleEligible),
                    }),
                  );
                }
                const moduleMastered = Number(module.processed_audio_count) || 0;
                if (moduleMastered > 0) {
                  moduleSummaryParts.push(
                    t('storage.modules.masteredCount', {
                      count: moduleMastered,
                      lectureWord: pluralize(currentLanguage, 'counts.lecture', moduleMastered),
                    }),
                  );
                }
                const moduleMeta = document.createElement('p');
                moduleMeta.className = 'storage-module-meta';
                moduleMeta.textContent = moduleSummaryParts.filter(Boolean).join(' • ');
                moduleItem.appendChild(moduleMeta);

                const lectures = Array.isArray(module.lectures) ? module.lectures : [];
                if (!lectures.length) {
                  const emptyLecture = document.createElement('p');
                  emptyLecture.className = 'storage-module-meta';
                  emptyLecture.textContent = t('storage.modules.empty');
                  moduleItem.appendChild(emptyLecture);
                } else {
                  const lectureList = document.createElement('ul');
                  lectureList.className = 'storage-lecture-list';
                  lectures.forEach((lecture) => {
                    if (!lecture || typeof lecture !== 'object') {
                      return;
                    }
                    const lectureItem = document.createElement('li');
                    lectureItem.className = 'storage-lecture-item';

                    const lectureHeader = document.createElement('div');
                    lectureHeader.className = 'storage-lecture-header';

                    const lectureTitle = document.createElement('p');
                    lectureTitle.className = 'storage-lecture-title';
                    lectureTitle.textContent = lecture.name || t('storage.unnamedLecture');
                    lectureHeader.appendChild(lectureTitle);

                    const lectureSize = document.createElement('span');
                    lectureSize.className = 'storage-lecture-size';
                    lectureSize.textContent =
                      typeof lecture.size === 'number' && lecture.size >= 0
                        ? formatBytes(lecture.size)
                        : '—';
                    lectureHeader.appendChild(lectureSize);

                    lectureItem.appendChild(lectureHeader);

                    const lectureMeta = document.createElement('p');
                    lectureMeta.className = 'storage-lecture-meta';
                    const assetLabels = [];
                    if (lecture.has_audio) {
                      assetLabels.push(t('storage.lecture.audio'));
                    }
                    if (lecture.has_processed_audio) {
                      assetLabels.push(t('storage.lecture.processedAudio'));
                    }
                    if (lecture.has_transcript) {
                      assetLabels.push(t('storage.lecture.transcript'));
                    }
                    if (lecture.has_notes) {
                      assetLabels.push(t('storage.lecture.notes'));
                    }
                    if (lecture.has_slides) {
                      assetLabels.push(t('storage.lecture.slides'));
                    }
                    lectureMeta.textContent = assetLabels.length
                      ? assetLabels.join(' • ')
                      : t('storage.lecture.empty');
                    lectureItem.appendChild(lectureMeta);

                    const badgeContainer = document.createElement('div');
                    badgeContainer.className = 'storage-lecture-badges';

                    if (lecture.has_processed_audio) {
                      const processedBadge = document.createElement('span');
                      processedBadge.className = 'storage-lecture-processed';
                      processedBadge.textContent = t('storage.lecture.processedBadge');
                      badgeContainer.appendChild(processedBadge);
                    }

                    if (lecture.eligible_audio) {
                      const eligibleBadge = document.createElement('span');
                      eligibleBadge.className = 'storage-lecture-eligible';
                      eligibleBadge.textContent = t('storage.lecture.eligible');
                      badgeContainer.appendChild(eligibleBadge);
                    }

                    if (badgeContainer.childElementCount > 0) {
                      lectureItem.appendChild(badgeContainer);
                    }

                    lectureList.appendChild(lectureItem);
                  });
                  moduleItem.appendChild(lectureList);
                }

                moduleList.appendChild(moduleItem);
              });
              classItem.appendChild(moduleList);
            }

            container.appendChild(classItem);
          });
        }

        function getStorageBrowserState() {
          const storageState = state.storage;
          if (!storageState || typeof storageState !== 'object') {
            return {
              path: '',
              parent: null,
              entries: [],
              loading: false,
              initialized: false,
              deleting: new Set(),
              error: null,
            };
          }
          if (!storageState.browser || typeof storageState.browser !== 'object') {
            storageState.browser = {
              path: '',
              parent: null,
              entries: [],
              loading: false,
              initialized: false,
              deleting: new Set(),
              error: null,
            };
          }
          const browserState = storageState.browser;
          if (!(browserState.deleting instanceof Set)) {
            const existing = browserState.deleting;
            browserState.deleting = new Set(
              Array.isArray(existing)
                ? existing
                : existing && typeof existing === 'string'
                ? [existing]
                : [],
            );
          }
          if (!(browserState.selected instanceof Set)) {
            const existingSelected = browserState.selected;
            browserState.selected = new Set(
              Array.isArray(existingSelected)
                ? existingSelected
                : existingSelected && typeof existingSelected === 'string'
                ? [existingSelected]
                : [],
            );
          }
          if (browserState.error !== null && typeof browserState.error !== 'string') {
            browserState.error = null;
          }
          return browserState;
        }

        function renderStorageBrowser() {
          if (!dom.storage || !dom.storage.browser) {
            return;
          }
          const browserState = getStorageBrowserState();
          const pathElement = dom.storage.path;
          if (pathElement) {
            const displayPath = browserState.path ? `/${browserState.path}` : '/';
            pathElement.textContent = displayPath;
            pathElement.setAttribute('title', displayPath);
          }

          const navRoot = dom.storage.browser.navRoot;
          if (navRoot) {
            navRoot.disabled = browserState.loading || !browserState.path;
          }
          const navUp = dom.storage.browser.navUp;
          if (navUp) {
            navUp.disabled = browserState.loading || browserState.parent === null;
          }

          const loadingElement = dom.storage.browser.loading;
          const emptyElement = dom.storage.browser.empty;
          const tableWrapper = dom.storage.browser.tableWrapper;
          const tableBody = dom.storage.browser.tableBody;
          const downloadButton = dom.storage.downloadSelected;
          const selectAllControl = dom.storage.browser.selectAll;

          const isLoading = Boolean(browserState.loading);
          const entries = Array.isArray(browserState.entries) ? browserState.entries : [];
          const hasEntries = entries.length > 0;

          if (loadingElement) {
            loadingElement.hidden = !isLoading;
          }

          if (emptyElement) {
            const defaultMessage = t('storage.browser.empty');
            const message = browserState.error ? browserState.error : defaultMessage;
            emptyElement.textContent = message;
            emptyElement.hidden = isLoading || hasEntries;
          }

          if (tableWrapper) {
            tableWrapper.hidden = isLoading || !hasEntries;
          }

          if (tableBody) {
            tableBody.innerHTML = '';
            let visibleSelectableCount = 0;
            let visibleSelectedCount = 0;
            if (!isLoading && hasEntries) {
              entries.forEach((entry) => {
                if (!entry || typeof entry !== 'object') {
                  return;
                }
                const row = document.createElement('tr');
                const entryPath = typeof entry.path === 'string' ? entry.path : '';
                const entryName = typeof entry.name === 'string' && entry.name
                  ? entry.name
                  : entryPath;
                const isDirectory = Boolean(entry.is_dir);
                const isDeleting = browserState.deleting.has(entryPath);
                const isSelected = browserState.selected.has(entryPath);
                if (isSelected) {
                  row.classList.add('is-selected');
                }
                row.dataset.storagePath = entryPath;
                row.dataset.storageType = isDirectory ? 'directory' : 'file';

                const selectCell = document.createElement('td');
                selectCell.className = 'storage-select-cell';
                if (entryPath) {
                  const checkbox = document.createElement('input');
                  checkbox.type = 'checkbox';
                  checkbox.className = 'storage-select-checkbox';
                  checkbox.dataset.storageSelect = entryPath;
                  checkbox.checked = isSelected;
                  checkbox.disabled = browserState.loading || isDeleting;
                  const labelName = entryName || t('storage.browser.unnamed');
                  checkbox.setAttribute(
                    'aria-label',
                    t('storage.browser.selectAction', { name: labelName }),
                  );
                  selectCell.appendChild(checkbox);
                  visibleSelectableCount += 1;
                  if (isSelected) {
                    visibleSelectedCount += 1;
                  }
                }
                row.appendChild(selectCell);

                const nameCell = document.createElement('td');
                if (isDirectory) {
                  const button = document.createElement('button');
                  button.type = 'button';
                  button.className = 'storage-entry-name';
                  button.dataset.storageAction = 'open';
                  button.dataset.storagePath = entryPath;
                  button.textContent = entryName || t('storage.browser.unnamed');
                  nameCell.appendChild(button);
                } else {
                  const link = document.createElement('a');
                  link.className = 'storage-entry-name';
                  link.href = buildStorageURL(entryPath);
                  link.textContent = entryName || t('storage.browser.unnamed');
                  link.target = '_blank';
                  link.rel = 'noopener noreferrer';
                  nameCell.appendChild(link);
                }
                row.appendChild(nameCell);

                const typeCell = document.createElement('td');
                typeCell.className = 'storage-entry-type';
                typeCell.textContent = isDirectory
                  ? t('storage.browser.directory')
                  : t('storage.browser.file');
                row.appendChild(typeCell);

                const sizeCell = document.createElement('td');
                const sizeValue = Number.isFinite(entry?.size)
                  ? Number(entry.size)
                  : Number(entry?.size);
                if (Number.isFinite(sizeValue) && sizeValue >= 0) {
                  sizeCell.textContent = formatBytes(sizeValue);
                } else {
                  sizeCell.textContent = '—';
                }
                row.appendChild(sizeCell);

                const modifiedCell = document.createElement('td');
                const modifiedText = entry?.modified ? formatDate(entry.modified) : '';
                modifiedCell.textContent = modifiedText || '—';
                row.appendChild(modifiedCell);

                const actionsCell = document.createElement('td');
                actionsCell.className = 'storage-entry-actions';
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.dataset.storageAction = 'delete';
                deleteButton.dataset.storagePath = entryPath;
                deleteButton.dataset.storageName = entryName || entryPath || '';
                deleteButton.textContent = t('common.actions.delete');
                deleteButton.disabled = !entryPath || browserState.loading || isDeleting;
                actionsCell.appendChild(deleteButton);
                row.appendChild(actionsCell);

                tableBody.appendChild(row);
              });
            }
            if (selectAllControl) {
              selectAllControl.disabled =
                browserState.loading || isLoading || visibleSelectableCount === 0;
              selectAllControl.indeterminate =
                visibleSelectedCount > 0 && visibleSelectedCount < visibleSelectableCount;
              selectAllControl.checked =
                visibleSelectableCount > 0 &&
                visibleSelectedCount === visibleSelectableCount &&
                !selectAllControl.indeterminate;
            }
            if (downloadButton) {
              downloadButton.disabled =
                browserState.loading || isLoading || browserState.selected.size === 0;
            }
          }
        }

        function renderStorage() {
          if (!dom.storage) {
            return;
          }
          const browserState = getStorageBrowserState();
          if (dom.storage.loading) {
            const showLoading = Boolean(
              state.storage.loading || (!browserState.initialized && browserState.loading),
            );
            dom.storage.loading.hidden = !showLoading;
          }
          const overview = state.storage.overview;
          const classes = Array.isArray(overview?.classes) ? overview.classes : [];
          if (dom.storage.empty) {
            dom.storage.empty.hidden = state.storage.loading || classes.length > 0;
          }
          if (dom.storage.wrapper) {
            dom.storage.wrapper.hidden = state.storage.loading || classes.length === 0;
          }
          renderStorageBrowser();
          renderStorageUsage();
          renderStoragePurgeSummary();
          renderStoragePurgeControls();
          renderStorageClasses();
        }

        function parseIsoDate(value) {
          if (typeof value !== 'string' || !value) {
            return null;
          }
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) {
            return null;
          }
          return date;
        }

        function formatDateTime(date) {
          if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return '';
          }
          try {
            const locale = getLocale(currentLanguage);
            return new Intl.DateTimeFormat(locale, {
              dateStyle: 'medium',
              timeStyle: 'medium',
            }).format(date);
          } catch (error) {
            return date.toLocaleString();
          }
        }

        function startUpdatePolling() {
          if (state.systemUpdate.pollTimer) {
            return;
          }
          state.systemUpdate.pollTimer = window.setInterval(() => {
            void fetchSystemUpdateStatus();
          }, UPDATE_POLL_INTERVAL_MS);
        }

        function stopUpdatePolling() {
          if (state.systemUpdate.pollTimer) {
            window.clearInterval(state.systemUpdate.pollTimer);
            state.systemUpdate.pollTimer = null;
          }
        }

        function renderSystemUpdate() {
          if (!dom.settingsUpdateStatus) {
            return;
          }
          const update = state.systemUpdate;
          const statusKey = update.running
            ? 'running'
            : update.success === true
            ? 'success'
            : update.success === false
            ? 'failure'
            : 'idle';
          dom.settingsUpdateStatus.textContent = t(`settings.update.status.${statusKey}`);

          if (dom.settingsUpdateMeta) {
            const parts = [];
            if (update.startedAt) {
              parts.push(t('settings.update.startedAt', { time: formatDateTime(update.startedAt) }));
            }
            if (update.finishedAt && !update.running) {
              parts.push(t('settings.update.finishedAt', { time: formatDateTime(update.finishedAt) }));
            }
            if (typeof update.exitCode === 'number' && Number.isFinite(update.exitCode)) {
              parts.push(t('settings.update.exitCode', { code: update.exitCode }));
            }
            if (update.error && !update.running) {
              parts.push(update.error);
            }
            if (parts.length > 0) {
              dom.settingsUpdateMeta.textContent = parts.join(' ');
              dom.settingsUpdateMeta.hidden = false;
            } else {
              dom.settingsUpdateMeta.textContent = '';
              dom.settingsUpdateMeta.hidden = true;
            }
          }

          if (dom.settingsUpdateRun) {
            dom.settingsUpdateRun.disabled = update.running;
          }
          if (dom.settingsUpdateRefresh) {
            dom.settingsUpdateRefresh.disabled = update.running;
          }

          if (dom.settingsUpdateLogWrapper) {
            const entries = Array.isArray(update.log) ? update.log : [];
            const hasEntries = entries.length > 0;
            const shouldShowWrapper = update.running || hasEntries;
            dom.settingsUpdateLogWrapper.hidden = !shouldShowWrapper;
            if (dom.settingsUpdateLog) {
              if (hasEntries) {
                const formatted = entries
                  .map((entry) => {
                    const stamp = parseIsoDate(entry.timestamp);
                    const prefix = stamp ? `[${formatDateTime(stamp)}] ` : '';
                    const message = typeof entry.message === 'string' ? entry.message : '';
                    return `${prefix}${message}`.trimEnd();
                  })
                  .join('\n');
                dom.settingsUpdateLog.textContent = formatted;
                dom.settingsUpdateLog.hidden = false;
                dom.settingsUpdateLog.scrollTop = dom.settingsUpdateLog.scrollHeight;
              } else {
                dom.settingsUpdateLog.textContent = '';
                dom.settingsUpdateLog.hidden = true;
              }
            }
            if (dom.settingsUpdateLogEmpty) {
              dom.settingsUpdateLogEmpty.hidden = hasEntries;
            }
          }
        }

        function applySystemUpdate(update) {
          if (!update || typeof update !== 'object') {
            return;
          }
          const previousRunning = state.systemUpdate.running;
          state.systemUpdate.running = Boolean(update.running);
          state.systemUpdate.startedAt = parseIsoDate(update.started_at);
          state.systemUpdate.finishedAt = parseIsoDate(update.finished_at);
          state.systemUpdate.success =
            typeof update.success === 'boolean' ? update.success : null;
          state.systemUpdate.exitCode =
            typeof update.exit_code === 'number' && Number.isFinite(update.exit_code)
              ? update.exit_code
              : null;
          state.systemUpdate.error =
            typeof update.error === 'string' && update.error ? update.error : null;
          state.systemUpdate.log = Array.isArray(update.log) ? update.log : [];
          renderSystemUpdate();
          if (state.systemUpdate.running) {
            if (!previousRunning) {
              showStatus(t('status.updateRunning'), 'info', { persist: true });
            }
            startUpdatePolling();
          } else {
            stopUpdatePolling();
            if (previousRunning) {
              if (state.systemUpdate.success) {
                showStatus(t('status.updateCompleted'), 'success');
              } else if (state.systemUpdate.success === false) {
                const message = state.systemUpdate.error || t('status.updateFailed');
                showStatus(message, 'error');
              }
            }
          }
        }

        async function fetchSystemUpdateStatus() {
          try {
            const payload = await request('/api/system/update');
            applySystemUpdate(payload?.update);
          } catch (error) {
            if (state.systemUpdate.running) {
              const message = error instanceof Error ? error.message : String(error);
              showStatus(message || t('status.updateFailed'), 'error');
              stopUpdatePolling();
            }
          } finally {
            renderSystemUpdate();
          }
        }

        async function triggerSystemUpdate() {
          if (!dom.settingsUpdateRun) {
            return;
          }
          if (dom.settingsUpdateRun.disabled) {
            return;
          }
          showStatus(t('status.updateStarted'), 'info');
          dom.settingsUpdateRun.disabled = true;
          if (dom.settingsUpdateRefresh) {
            dom.settingsUpdateRefresh.disabled = true;
          }
          try {
            const payload = await request('/api/system/update', { method: 'POST' });
            applySystemUpdate(payload?.update);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (typeof message === 'string' && message.toLowerCase().includes('already')) {
              showStatus(t('status.updateConflict'), 'info');
            } else {
              showStatus(message || t('status.updateFailed'), 'error');
            }
            await fetchSystemUpdateStatus();
          } finally {
            renderSystemUpdate();
          }
        }

        async function loadStorageBrowser(path, options = {}) {
          const browserState = getStorageBrowserState();
          const previousPath = browserState.path || '';
          const targetPath = typeof path === 'string' ? path : previousPath;
          if (targetPath !== previousPath) {
            browserState.selected.clear();
          }
          try {
            const payload = await request(buildStorageListUrl(targetPath));
            const entries = Array.isArray(payload?.entries) ? payload.entries : [];
            browserState.path = typeof payload?.path === 'string' ? payload.path : '';
            if (typeof payload?.parent === 'string') {
              browserState.parent = payload.parent;
            } else if (payload?.parent === null) {
              browserState.parent = null;
            } else {
              browserState.parent = null;
            }
            browserState.entries = entries;
            browserState.error = null;
            browserState.deleting.clear();
            const validPaths = new Set(
              entries
                .map((entry) => (typeof entry?.path === 'string' ? entry.path : ''))
                .filter((value) => typeof value === 'string' && value),
            );
            Array.from(browserState.selected).forEach((value) => {
              if (!validPaths.has(value)) {
                browserState.selected.delete(value);
              }
            });
            browserState.initialized = true;
            return browserState.path;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            browserState.error = message || t('status.storageLoadFailed');
            browserState.entries = [];
            browserState.parent = null;
            if (typeof targetPath === 'string') {
              browserState.path = targetPath;
            }
            if (!options?.silent) {
              showStatus(browserState.error, 'error');
            }
            browserState.initialized = true;
            return browserState.path;
          }
        }

        async function refreshStorage(options = {}) {
          if (!dom.storage) {
            return;
          }
          const includeOverview = options.includeOverview !== false;
          const force = options.force === true;
          const browserState = getStorageBrowserState();
          if (!force && (state.storage.loading || browserState.loading)) {
            return;
          }
          const targetPath =
            typeof options.path === 'string' ? options.path : browserState.path || '';

          if (includeOverview) {
            state.storage.loading = true;
          }
          browserState.loading = true;
          renderStorage();

          if (includeOverview) {
            try {
              const overviewPayload = await request('/api/storage/overview');
              state.storage.overview = overviewPayload ?? null;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              showStatus(message || t('status.storageLoadFailed'), 'error');
              state.storage.overview = null;
            }
            try {
              const usagePayload = await request('/api/storage/usage');
              state.storage.usage = usagePayload?.usage ?? usagePayload ?? null;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              showStatus(message || t('status.storageUsageFailed'), 'error');
            }
            state.storage.initialized = true;
            state.storage.loading = false;
          }

          await loadStorageBrowser(targetPath, { silent: options.silent === true });
          browserState.loading = false;
          browserState.initialized = true;
          renderStorage();
        }

        async function handleStorageEntryDeletion(path, name) {
          const browserState = getStorageBrowserState();
          const targetPath = typeof path === 'string' ? path : '';
          if (!targetPath) {
            return;
          }
          const fallbackName = targetPath.split('/').pop() || targetPath;
          const displayName = name || fallbackName || t('storage.browser.unnamed');
          const confirmed = await confirmDialog({
            title: t('storage.dialogs.deleteTitle'),
            message: t('storage.dialogs.deleteMessage', { name: displayName }),
            confirmText: t('storage.dialogs.deleteConfirm'),
            cancelText: t('dialog.cancel'),
            variant: 'danger',
          });
          if (!confirmed) {
            return;
          }
          browserState.deleting.add(targetPath);
          browserState.selected.delete(targetPath);
          renderStorageBrowser();
          try {
            await request('/api/storage', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: targetPath }),
            });
            browserState.deleting.delete(targetPath);
            showStatus(t('status.storageDeleted'), 'success');
            const currentPath = browserState.path || '';
            await refreshStorage({ includeOverview: true, path: currentPath, force: true });
          } catch (error) {
            browserState.deleting.delete(targetPath);
            const message = error instanceof Error ? error.message : String(error);
            showStatus(message || t('status.storageDeleteFailed'), 'error');
            renderStorageBrowser();
          }
        }

        async function handleStorageBrowserAction(event) {
          const target = event.target;
          if (!(target instanceof Element)) {
            return;
          }
          const actionElement = target.closest('[data-storage-action]');
          if (!actionElement) {
            return;
          }
          const action = actionElement.dataset.storageAction;
          const path = actionElement.dataset.storagePath || '';
          if (action === 'open') {
            event.preventDefault();
            if (!path) {
              return;
            }
            await refreshStorage({ includeOverview: false, path, force: true });
            return;
          }
          if (action === 'delete') {
            event.preventDefault();
            if (!path) {
              return;
            }
            const name = actionElement.dataset.storageName || '';
            await handleStorageEntryDeletion(path, name);
          }
        }

        function handleStorageSelectionChange(event) {
          const target = event.target;
          if (!(target instanceof HTMLInputElement)) {
            return;
          }
          if (target.type !== 'checkbox') {
            return;
          }
          const entryPath = target.dataset.storageSelect || '';
          if (!entryPath) {
            return;
          }
          const browserState = getStorageBrowserState();
          if (target.checked) {
            browserState.selected.add(entryPath);
          } else {
            browserState.selected.delete(entryPath);
          }
          renderStorageBrowser();
        }

        function handleStorageSelectAll(event) {
          const target = event.target;
          if (!(target instanceof HTMLInputElement)) {
            return;
          }
          if (target.disabled) {
            return;
          }
          const browserState = getStorageBrowserState();
          browserState.selected.clear();
          if (target.checked) {
            const entries = Array.isArray(browserState.entries) ? browserState.entries : [];
            entries.forEach((entry) => {
              if (!entry || typeof entry !== 'object') {
                return;
              }
              const entryPath = typeof entry.path === 'string' ? entry.path : '';
              if (entryPath) {
                browserState.selected.add(entryPath);
              }
            });
          }
          renderStorageBrowser();
        }

        async function handleStorageDownloadSelected() {
          if (!dom.storage || !dom.storage.downloadSelected) {
            return;
          }
          const browserState = getStorageBrowserState();
          const selected = Array.from(browserState.selected);
          if (selected.length === 0) {
            showStatus(t('status.storageDownloadNone'), 'info');
            return;
          }
          dom.storage.downloadSelected.disabled = true;
          let success = false;
          try {
            const response = await request('/api/storage/download', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paths: selected }),
            });
            const archive = response?.archive;
            if (!archive || typeof archive.path !== 'string' || !archive.path) {
              throw new Error(t('status.storageDownloadFailed'));
            }
            const downloadUrl = buildStorageURL(archive.path);
            const fileName =
              typeof archive.filename === 'string' && archive.filename
                ? archive.filename
                : 'storage-selection.zip';
            const anchor = document.createElement('a');
            anchor.href = downloadUrl;
            anchor.download = fileName;
            anchor.rel = 'noopener noreferrer';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            success = true;
            showStatus(t('status.storageDownloadReady'), 'success');
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showStatus(message || t('status.storageDownloadFailed'), 'error');
          } finally {
            if (dom.storage && dom.storage.downloadSelected) {
              dom.storage.downloadSelected.disabled = false;
            }
            if (success) {
              browserState.selected.clear();
            }
            renderStorageBrowser();
          }
        }

        function resolveProgressOperationLabel(entry) {
          if (!entry) {
            return '';
          }
          if (entry.type === 'transcription') {
            return t('progress.labels.transcription');
          }
          const operation = entry?.context?.operation || entry?.context?.type || '';
          if (operation === 'slide_bundle') {
            return t('progress.labels.slideBundle');
          }
          if (operation === 'audio_mastering') {
            return t('progress.labels.audioMastering');
          }
          return t('progress.labels.processing');
        }

        function renderProgressQueue() {
          if (!dom.progress || !dom.progress.list) {
            return;
          }
          const entries = Array.isArray(state.progress.entries)
            ? state.progress.entries
            : [];
          dom.progress.list.innerHTML = '';
          const isLoading = Boolean(state.progress.loading);
          if (dom.progress.container) {
            dom.progress.container.setAttribute('aria-busy', isLoading ? 'true' : 'false');
          }
          if (!entries.length) {
            if (dom.progress.empty) {
              dom.progress.empty.classList.remove('hidden');
            }
            return;
          }
          if (dom.progress.empty) {
            dom.progress.empty.classList.add('hidden');
          }
          entries.forEach((entry) => {
            const lectureId = Number(entry?.lecture_id);
            const listItem = document.createElement('li');
            listItem.className = 'progress-entry';
            listItem.dataset.status = entry?.error
              ? 'error'
              : entry?.finished
              ? 'finished'
              : 'running';
            listItem.dataset.progressType = entry?.type || '';
            listItem.dataset.lectureId = Number.isFinite(lectureId)
              ? String(lectureId)
              : '';

            const title = document.createElement('div');
            title.className = 'progress-entry-title';
            const heading = document.createElement('h3');
            const lectureName = entry?.lecture?.name || t('progress.labels.untitled');
            heading.textContent = lectureName;
            const statusKey = entry?.error
              ? 'error'
              : entry?.finished
              ? 'finished'
              : 'running';
            const statusLabel = document.createElement('span');
            statusLabel.className = 'progress-entry-status';
            statusLabel.textContent = t(`progress.status.${statusKey}`);
            title.appendChild(heading);
            title.appendChild(statusLabel);
            listItem.appendChild(title);

            const meta = document.createElement('div');
            meta.className = 'progress-entry-meta';
            const typeLabel = document.createElement('span');
            typeLabel.textContent = resolveProgressOperationLabel(entry);
            meta.appendChild(typeLabel);
            const locationParts = [];
            if (entry?.lecture?.class) {
              locationParts.push(entry.lecture.class);
            }
            if (entry?.lecture?.module) {
              locationParts.push(entry.lecture.module);
            }
            if (locationParts.length > 0) {
              const location = document.createElement('span');
              location.textContent = locationParts.join(' • ');
              meta.appendChild(location);
            }
            listItem.appendChild(meta);

            const messageText = entry?.message || '';
            if (messageText) {
              const message = document.createElement('p');
              message.className = 'progress-entry-message';
              message.textContent = messageText;
              listItem.appendChild(message);
            }

            const ratio = Number.isFinite(entry?.ratio) ? Number(entry.ratio) : null;
            if (ratio !== null) {
              const percent = Math.max(0, Math.min(1, ratio)) * 100;
              const bar = document.createElement('div');
              bar.className = 'status-progress';
              const track = document.createElement('div');
              track.className = 'status-progress-track';
              const fill = document.createElement('div');
              fill.className = 'status-progress-fill';
              fill.style.width = `${percent}%`;
              track.appendChild(fill);
              const percentLabel = document.createElement('span');
              percentLabel.className = 'status-progress-text';
              percentLabel.textContent = `${Math.round(percent)}%`;
              bar.appendChild(track);
              bar.appendChild(percentLabel);
              listItem.appendChild(bar);
            }

            const actions = document.createElement('div');
            actions.className = 'progress-entry-actions';
            if (entry?.retryable) {
              const retryButton = document.createElement('button');
              retryButton.type = 'button';
              retryButton.dataset.progressAction = 'retry';
              retryButton.dataset.progressType = entry?.type || '';
              retryButton.dataset.lectureId = listItem.dataset.lectureId || '';
              retryButton.textContent = t('progress.retry');
              actions.appendChild(retryButton);
            }
            if (entry?.lecture && Number.isFinite(lectureId)) {
              const openButton = document.createElement('button');
              openButton.type = 'button';
              openButton.className = 'text';
              openButton.dataset.progressAction = 'open';
              openButton.dataset.progressType = entry?.type || '';
              openButton.dataset.lectureId = listItem.dataset.lectureId || '';
              openButton.textContent = t('progress.openLecture');
              actions.appendChild(openButton);
            }
            const dismissButton = document.createElement('button');
            dismissButton.type = 'button';
            dismissButton.className = 'text';
            dismissButton.dataset.progressAction = 'dismiss';
            dismissButton.dataset.progressType = entry?.type || '';
            dismissButton.dataset.lectureId = listItem.dataset.lectureId || '';
            dismissButton.textContent = t('progress.dismiss');
            actions.appendChild(dismissButton);
            listItem.appendChild(actions);

            dom.progress.list.appendChild(listItem);
          });
        }

        async function refreshProgressQueue({ force = false, silent = false } = {}) {
          if (state.progress.loading && !force) {
            return;
          }
          if (!dom.progress) {
            return;
          }
          state.progress.loading = true;
          if (!silent) {
            renderProgressQueue();
          }
          try {
            const payload = await request('/api/progress');
            state.progress.entries = Array.isArray(payload?.entries)
              ? payload.entries
              : [];
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            if (!silent && detail) {
              showStatus(detail, 'error');
            }
          } finally {
            state.progress.loading = false;
            renderProgressQueue();
          }
        }

        function stopProgressPolling() {
          if (state.progress.timer !== null) {
            window.clearInterval(state.progress.timer);
          }
          state.progress.timer = null;
        }

        function startProgressPolling() {
          stopProgressPolling();
          if (!dom.progress || !dom.progress.container) {
            return;
          }
          let polling = false;
          const poll = async () => {
            if (polling) {
              return;
            }
            polling = true;
            try {
              await refreshProgressQueue({ silent: true });
            } finally {
              polling = false;
            }
          };
          void poll();
          state.progress.timer = window.setInterval(() => {
            void poll();
          }, 2500);
        }

        async function dismissProgressEntry(entry) {
          if (!entry) {
            return;
          }
          const lectureId = Number(entry.lecture_id);
          if (!Number.isFinite(lectureId)) {
            return;
          }
          const type = entry.type ? `?type=${encodeURIComponent(entry.type)}` : '';
          try {
            await request(`/api/progress/${lectureId}${type}`, { method: 'DELETE' });
            state.progress.entries = state.progress.entries.filter(
              (item) =>
                !(Number(item?.lecture_id) === lectureId && item?.type === entry.type),
            );
            renderProgressQueue();
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            showStatus(detail || t('status.processing'), 'error');
          }
        }

        async function retryProgressEntry(entry) {
          if (!entry) {
            return;
          }
          const lectureId = Number(entry.lecture_id);
          if (!Number.isFinite(lectureId)) {
            return;
          }
          try {
            if (entry.type === 'transcription') {
              const model = entry?.context?.model || state.settings?.whisper_model || 'base';
              await request(`/api/lectures/${lectureId}/transcribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model }),
              });
              startTranscriptionProgress(lectureId);
            } else if (entry.type === 'processing') {
              const operation = entry?.context?.operation || entry?.context?.type;
              if (operation === 'slide_bundle') {
                const formData = new FormData();
                if (entry?.context?.preview_token) {
                  formData.append('preview_token', entry.context.preview_token);
                }
                const pageRange = entry?.context?.page_range;
                if (pageRange?.start) {
                  formData.append('page_start', String(pageRange.start));
                }
                if (pageRange?.end) {
                  formData.append('page_end', String(pageRange.end));
                }
                await request(`/api/lectures/${lectureId}/process-slides`, {
                  method: 'POST',
                  body: formData,
                });
                startProcessingProgress(lectureId);
              } else {
                showStatus(t('progress.retryUnavailable'), 'info');
                return;
              }
            }
            await refreshProgressQueue({ force: true, silent: true });
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            showStatus(detail || t('status.processing'), 'error');
          }
        }

        async function handleProgressAction(event) {
          const target = event.target instanceof HTMLElement ? event.target : null;
          if (!target) {
            return;
          }
          const button = target.closest('button[data-progress-action]');
          if (!button) {
            return;
          }
          const action = button.dataset.progressAction || '';
          const lectureId = Number(button.dataset.lectureId);
          const type = button.dataset.progressType || '';
          const entry = state.progress.entries.find(
            (item) =>
              Number(item?.lecture_id) === lectureId &&
              (type ? item?.type === type : true),
          );
          if (action === 'retry') {
            await retryProgressEntry(entry);
            return;
          }
          if (action === 'dismiss') {
            await dismissProgressEntry(entry);
            return;
          }
          if (action === 'open' && Number.isFinite(lectureId)) {
            await selectLecture(lectureId);
            setActiveView('details');
          }
        }

        async function handlePurgeProcessedAudio() {
          if (!dom.storage || !dom.storage.purge) {
            return;
          }
          const overview = state.storage.overview;
          const eligible = Number(overview?.eligible_audio_total) || 0;
          if (!eligible || state.storage.purging) {
            return;
          }
          const lectureWord = pluralize(currentLanguage, 'counts.lecture', eligible);
          const confirmed = await confirmDialog({
            title: t('storage.dialogs.purgeTitle'),
            message: t('storage.dialogs.purgeMessage', { count: eligible, lectureWord }),
            confirmText: t('common.actions.delete'),
            cancelText: t('dialog.cancel'),
            variant: 'danger',
          });
          if (!confirmed) {
            return;
          }
          try {
            state.storage.purging = true;
            renderStorage();
            await request('/api/storage/purge-audio', { method: 'POST' });
            showStatus(t('status.storagePurged'), 'success');
            await refreshStorage();
          } catch (error) {
            const messageText = error instanceof Error ? error.message : String(error);
            showStatus(messageText || t('status.storagePurgeFailed'), 'error');
          } finally {
            state.storage.purging = false;
            renderStorage();
          }
        }

        applyTranslations(DEFAULT_LANGUAGE);
        renderStorage();
        renderSystemUpdate();
        renderProgressQueue();
        void refreshProgressQueue({ silent: true });

        const STATUS_DEFAULT_TIMEOUT = 5000;

        function resetStatusProgress() {
          if (dom.statusProgress) {
            dom.statusProgress.hidden = true;
          }
          if (dom.statusProgressFill) {
            dom.statusProgressFill.style.width = '0%';
          }
          if (dom.statusProgressText) {
            dom.statusProgressText.textContent = '';
          }
        }

        function hideStatus() {
          if (state.statusHideTimer !== null) {
            window.clearTimeout(state.statusHideTimer);
            state.statusHideTimer = null;
          }
          if (!dom.status) {
            return;
          }
          dom.status.style.display = 'none';
          dom.status.removeAttribute('data-variant');
          if (dom.statusMessage) {
            dom.statusMessage.textContent = '';
          } else {
            dom.status.textContent = '';
          }
          resetStatusProgress();
        }

        const assetDefinitions = [
          {
            key: 'audio_path',
            labelKey: 'assets.labels.audio',
            accept: 'audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.oga,.opus',
            type: 'audio',
          },
          {
            key: 'processed_audio_path',
            labelKey: 'assets.labels.masteredAudio',
            accept: null,
            type: 'processed_audio',
          },
          {
            key: 'slide_path',
            labelKey: 'assets.labels.slides',
            accept: 'application/pdf',
            type: 'slides',
          },
          {
            key: 'transcript_path',
            labelKey: 'assets.labels.transcript',
            accept: '.txt,.md,text/plain',
            type: 'transcript',
          },
          {
            key: 'notes_path',
            labelKey: 'assets.labels.notes',
            accept:
              '.txt,.md,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            type: 'notes',
          },
          {
            key: 'slide_image_dir',
            labelKey: 'assets.labels.slideBundle',
            accept: null,
            type: 'slide_bundle',
          },
        ];

        function showStatus(message, variant = 'info', options = {}) {
          if (!dom.status) {
            return;
          }

          if (state.statusHideTimer !== null) {
            window.clearTimeout(state.statusHideTimer);
            state.statusHideTimer = null;
          }

          if (!message) {
            hideStatus();
            return;
          }

          const ratioValue =
            options && typeof options.progressRatio === 'number'
              ? options.progressRatio
              : null;
          const hasRatio = Number.isFinite(ratioValue);
          const clampedRatio = hasRatio
            ? Math.max(0, Math.min(Number(ratioValue), 1))
            : null;

          dom.status.dataset.variant = variant;
          dom.status.style.display = 'block';
          if (dom.statusMessage) {
            dom.statusMessage.textContent = message;
          } else {
            dom.status.textContent = message;
          }

          if (clampedRatio !== null) {
            const percentValue = Math.round(clampedRatio * 1000) / 10;
            const label = Number.isInteger(percentValue)
              ? `${percentValue}%`
              : `${percentValue.toFixed(1)}%`;
            if (dom.statusProgress) {
              dom.statusProgress.hidden = false;
            }
            if (dom.statusProgressFill) {
              dom.statusProgressFill.style.width = `${percentValue}%`;
            }
            if (dom.statusProgressText) {
              dom.statusProgressText.textContent = label;
            }
          } else {
            resetStatusProgress();
          }

          const progressActive = clampedRatio !== null && clampedRatio < 1;
          const persistOption =
            options && Object.prototype.hasOwnProperty.call(options, 'persist')
              ? Boolean(options.persist)
              : progressActive;
          const timeoutMs =
            options && typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
              ? Math.max(0, options.timeoutMs)
              : STATUS_DEFAULT_TIMEOUT;

          if (!persistOption) {
            state.statusHideTimer = window.setTimeout(() => {
              state.statusHideTimer = null;
              hideStatus();
            }, timeoutMs);
          }
        }

        function updateGpuWhisperUI(status = {}) {
          const supported = Boolean(status.supported);
          const checked = Boolean(status.checked);
          const unavailable = Boolean(status.unavailable);
          const output = typeof status.output === 'string' ? status.output : '';
          const lastChecked = status.last_checked || null;
          let message =
            typeof status.message === 'string' && status.message.trim().length > 0
              ? status.message.trim()
              : checked
              ? t('status.gpuUnavailable')
              : t('settings.whisper.gpu.status');

          state.gpuWhisper = {
            supported,
            checked,
            message,
            output,
            lastChecked,
            unavailable,
          };

          if (dom.settingsWhisperGpuStatus) {
            let displayMessage = message;
            if (output) {
              const snippet = output.split('\n').slice(0, 5).join('\n').trim();
              if (snippet && snippet !== message) {
                displayMessage = `${message}\n${snippet}`;
              }
            }
            dom.settingsWhisperGpuStatus.textContent = displayMessage;
          }

          if (dom.settingsWhisperGpuTest) {
            dom.settingsWhisperGpuTest.disabled = unavailable;
            dom.settingsWhisperGpuTest.textContent = supported
              ? t('settings.whisper.gpu.retry')
              : t('settings.whisper.gpu.test');
          }

          if (dom.gpuModelOptions) {
            dom.gpuModelOptions.forEach((option) => {
              if (option instanceof HTMLOptionElement) {
                option.disabled = !supported;
              }
            });
          }

          const requestedModel =
            state.settings?.whisper_model_requested || state.settings?.whisper_model;
          if (!supported) {
            if (dom.settingsWhisperModel && dom.settingsWhisperModel.value === GPU_MODEL) {
              dom.settingsWhisperModel.value = DEFAULT_WHISPER_MODEL;
            }
            const transcribeSelect = getTranscribeModelSelect();
            if (transcribeSelect && transcribeSelect.value === GPU_MODEL) {
              setTranscribeModelValue(DEFAULT_WHISPER_MODEL);
            }
            if (state.settings) {
              state.settings.whisper_model = dom.settingsWhisperModel
                ? dom.settingsWhisperModel.value
                : DEFAULT_WHISPER_MODEL;
          }
          } else if (requestedModel === GPU_MODEL) {
            if (dom.settingsWhisperModel) {
              dom.settingsWhisperModel.value = GPU_MODEL;
            }
            setTranscribeModelValue(GPU_MODEL);
            if (state.settings) {
              state.settings.whisper_model = GPU_MODEL;
            }
        }
      }

      function ensureDebugPlaceholder() {
        if (!dom.debugLog || !dom.debugEmpty) {
          return;
        }
        if (!dom.debugEmpty.parentElement) {
          dom.debugLog.appendChild(dom.debugEmpty);
        }
      }

      function normalizeCorrelationValue(value) {
        if (typeof value === 'string') {
          return value.trim();
        }
        if (value == null) {
          return '';
        }
        return String(value).trim();
      }

      function getEntryCorrelation(entry, key) {
        if (!entry || typeof entry !== 'object') {
          return '';
        }
        const sources = [entry[key], entry?.context?.[key], entry?.payload?.[key]];
        for (const source of sources) {
          const normalized = normalizeCorrelationValue(source);
          if (normalized) {
            return normalized;
          }
        }
        return '';
      }

      function normalizeFilterValue(value) {
        if (typeof value === 'string') {
          return value.trim().toLowerCase();
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
          return String(value).trim().toLowerCase();
        }
        return '';
      }

      function hasActiveFilters() {
        const filters = state.debug.filters || {};
        if (normalizeFilterValue(filters.severity) && normalizeFilterValue(filters.severity) !== 'all') {
          return true;
        }
        if (normalizeFilterValue(filters.category) && normalizeFilterValue(filters.category) !== 'all') {
          return true;
        }
        return Boolean(
          normalizeFilterValue(filters.correlationId) ||
            normalizeFilterValue(filters.taskId) ||
            normalizeFilterValue(filters.query),
        );
      }

      function getEntrySeverity(entry) {
        const sources = [entry?.severity, entry?.level, entry?.status];
        for (const source of sources) {
          if (typeof source === 'string') {
            const normalized = source.trim().toLowerCase();
            if (!normalized) {
              continue;
            }
            if (normalized === 'failed' || normalized === 'failure') {
              return 'error';
            }
            return normalized;
          }
        }
        if (typeof entry?.context?.severity === 'string') {
          const normalized = entry.context.severity.trim().toLowerCase();
          if (normalized) {
            return normalized;
          }
        }
        if (typeof entry?.payload?.severity === 'string') {
          const normalized = entry.payload.severity.trim().toLowerCase();
          if (normalized) {
            return normalized;
          }
        }
        return 'info';
      }

      function getEntryCategory(entry) {
        const category = normalizeFilterValue(entry?.category);
        if (category) {
          return category;
        }
        const hasTaskId = Boolean(getEntryCorrelation(entry, 'task_id') || getEntryCorrelation(entry, 'taskId'));
        if (hasTaskId) {
          return 'task';
        }
        return 'app';
      }

      function getEntryTaskId(entry) {
        const taskKeys = ['task_id', 'taskId', 'job_id', 'jobId'];
        for (const key of taskKeys) {
          const value = getEntryCorrelation(entry, key);
          if (value) {
            return value;
          }
        }
        if (typeof entry?.task === 'string' && entry.task.trim()) {
          return entry.task.trim();
        }
        return '';
      }

      function collectEntryCorrelations(entry) {
        const values = new Set();
        const append = (value) => {
          const normalized = normalizeCorrelationValue(value);
          if (normalized) {
            values.add(normalized);
          }
        };
        const correlationKeys = [
          'correlation_id',
          'correlationId',
          'request_id',
          'requestId',
          'job_id',
          'jobId',
          'actor',
          'task_id',
          'taskId',
          'trace_id',
          'span_id',
          'parent_request_id',
        ];
        correlationKeys.forEach((key) => {
          append(getEntryCorrelation(entry, key));
        });
        if (Array.isArray(entry?.correlation_ids)) {
          entry.correlation_ids.forEach((value) => append(value));
        }
        if (typeof entry?.correlation_id === 'string') {
          append(entry.correlation_id);
        }
        return Array.from(values);
      }

      function entryMatchesQuery(entry, query) {
        const normalizedQuery = normalizeFilterValue(query);
        if (!normalizedQuery) {
          return true;
        }
        const segments = [];
        const append = (value) => {
          if (value == null) {
            return;
          }
          if (typeof value === 'string') {
            const normalized = value.toLowerCase();
            if (normalized) {
              segments.push(normalized);
            }
            return;
          }
          if (typeof value === 'number' || typeof value === 'boolean') {
            segments.push(String(value).toLowerCase());
            return;
          }
          if (typeof value === 'object') {
            try {
              const serialized = JSON.stringify(value);
              if (serialized) {
                segments.push(serialized.toLowerCase());
              }
            } catch (error) {
              console.warn('Unable to serialize log entry for search', error);
            }
          }
        };

        append(entry?.message);
        append(entry?.rendered);
        append(entry?.event_type);
        append(entry?.logger);
        append(entry?.category);
        append(entry?.context);
        append(entry?.payload);
        append(entry?.stack);
        append(entry?.error);
        append(entry?.exception);

        return segments.some((segment) => segment.includes(normalizedQuery));
      }

      function isEntryFailure(entry) {
        const severity = getEntrySeverity(entry);
        if (severity === 'error' || severity === 'critical') {
          return true;
        }
        const status = normalizeFilterValue(entry?.status);
        if (status === 'failed' || status === 'error') {
          return true;
        }
        const contextStatus = normalizeFilterValue(entry?.context?.status);
        if (contextStatus === 'failed' || contextStatus === 'error') {
          return true;
        }
        const payloadStatus = normalizeFilterValue(entry?.payload?.status);
        if (payloadStatus === 'failed' || payloadStatus === 'error') {
          return true;
        }
        if (typeof entry?.error === 'string' && entry.error.trim()) {
          return true;
        }
        if (typeof entry?.exception === 'string' && entry.exception.trim()) {
          return true;
        }
        return false;
      }

      function formatTimestamp(value) {
        if ((typeof value !== 'string' && typeof value !== 'number') || value === '') {
          return '';
        }
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toLocaleTimeString([], {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
        }
        if (typeof value === 'string') {
          return value;
        }
        return '';
      }

      function matchesDebugFilters(entry) {
        const filters = state.debug.filters || {};
        const severityFilter = normalizeFilterValue(filters.severity);
        if (severityFilter && severityFilter !== 'all') {
          const entrySeverity = getEntrySeverity(entry);
          if (severityFilter === 'error') {
            if (entrySeverity !== 'error' && entrySeverity !== 'critical') {
              return false;
            }
          } else if (entrySeverity !== severityFilter) {
            return false;
          }
        }

        const categoryFilter = normalizeFilterValue(filters.category);
        if (categoryFilter && categoryFilter !== 'all') {
          const entryCategory = getEntryCategory(entry);
          if (entryCategory !== categoryFilter) {
            return false;
          }
        }

        const correlationFilter = normalizeFilterValue(filters.correlationId);
        if (correlationFilter) {
          const correlations = collectEntryCorrelations(entry).map((value) => value.toLowerCase());
          const match = correlations.some((value) => value.includes(correlationFilter));
          if (!match) {
            return false;
          }
        }

        const taskFilter = normalizeFilterValue(filters.taskId);
        if (taskFilter) {
          const taskId = normalizeFilterValue(getEntryTaskId(entry));
          if (!taskId || !taskId.includes(taskFilter)) {
            return false;
          }
        }

        const query = filters.query;
        if (typeof query === 'string' && normalizeFilterValue(query)) {
          if (!entryMatchesQuery(entry, query)) {
            return false;
          }
        }

        return true;
      }

      function applyDebugFilters(entries) {
        const list = Array.isArray(entries) ? entries : [];
        return list.filter((entry) => matchesDebugFilters(entry));
      }

      function summarizeEntryDetails(entry) {
        const ignore = new Set([
          'request_id',
          'requestId',
          'job_id',
          'jobId',
          'actor',
          'correlation_id',
          'correlationId',
          'task_id',
          'taskId',
          'retry',
          'retry_count',
          'attempt',
          'duplicate',
          'is_duplicate',
        ]);
        const segments = [];
        const seen = new Set();
        const appendFrom = (source) => {
          if (!source || typeof source !== 'object') {
            return;
          }
          Object.entries(source).forEach(([key, value]) => {
            if (!key || ignore.has(key)) {
              return;
            }
            const normalized = normalizeCorrelationValue(value);
            if (!normalized) {
              return;
            }
            const label = `${key}: ${normalized}`;
            if (seen.has(label)) {
              return;
            }
            seen.add(label);
            segments.push(label);
          });
        };
        appendFrom(entry?.context);
        appendFrom(entry?.payload);
        if (typeof entry?.count === 'number' && entry.count > 1) {
          const label = `occurrences: ${entry.count}`;
          if (!seen.has(label)) {
            seen.add(label);
            segments.push(label);
          }
        }
        if (typeof entry?.last_duration_ms === 'number') {
          const last = entry.last_duration_ms.toFixed(1).replace(/\.0$/, '');
          const label = `last ${last} ms`;
          if (!seen.has(label)) {
            seen.add(label);
            segments.push(label);
          }
        }
        if (typeof entry?.average_duration_ms === 'number' && entry.average_duration_ms > 0) {
          const avg = entry.average_duration_ms.toFixed(1).replace(/\.0$/, '');
          const label = `avg ${avg} ms`;
          if (!seen.has(label)) {
            seen.add(label);
            segments.push(label);
          }
        }
        return segments;
      }

      function extractStackTrace(entry) {
        const candidates = [
          entry?.stack,
          entry?.exception?.stack,
          entry?.exception?.stacktrace,
          entry?.exception?.traceback,
          entry?.traceback,
          entry?.context?.stack,
          entry?.context?.stacktrace,
          entry?.context?.traceback,
          entry?.payload?.stack,
          entry?.payload?.stacktrace,
          entry?.payload?.trace,
        ];
        for (const candidate of candidates) {
          if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
          }
          if (Array.isArray(candidate) && candidate.length) {
            return candidate.join('\n');
          }
        }
        return '';
      }

      function extractCombinedContext(entry) {
        const combined = {};
        let hasValues = false;
        const merge = (source) => {
          if (!source || typeof source !== 'object') {
            return;
          }
          Object.entries(source).forEach(([key, value]) => {
            if (value === undefined) {
              return;
            }
            if (typeof key !== 'string' || !key) {
              return;
            }
            combined[key] = value;
            hasValues = true;
          });
        };
        merge(entry?.context);
        merge(entry?.payload);
        merge(entry?.extra);
        if (!hasValues) {
          return '';
        }
        try {
          return JSON.stringify(combined, null, 2);
        } catch (error) {
          console.warn('Unable to stringify log context', error);
          return String(combined);
        }
      }

      function extractEntryBadges(entry) {
        const badges = [];
        const retryCandidates = [
          entry?.retry,
          entry?.context?.retry,
          entry?.context?.retry_count,
          entry?.payload?.retry,
          entry?.payload?.retry_count,
          entry?.attempt,
          entry?.context?.attempt,
          entry?.payload?.attempt,
        ];
        let retryCount = null;
        retryCandidates.forEach((value) => {
          if (Number.isFinite(value)) {
            const numeric = Number(value);
            if (numeric > 0) {
              retryCount = retryCount === null ? numeric : Math.max(retryCount, numeric);
            }
          } else if (typeof value === 'string' && value.trim()) {
            const numeric = Number.parseInt(value.trim(), 10);
            if (!Number.isNaN(numeric) && numeric > 0) {
              retryCount = retryCount === null ? numeric : Math.max(retryCount, numeric);
            }
          }
        });
        if (retryCount !== null) {
          badges.push({ label: `retry ×${retryCount}`, variant: 'warning' });
        } else {
          const retryFlag = retryCandidates.some((value) => {
            if (typeof value === 'boolean') {
              return value;
            }
            if (typeof value === 'string') {
              const normalized = value.trim().toLowerCase();
              return normalized === 'true' || normalized === 'retry';
            }
            return false;
          });
          if (retryFlag) {
            badges.push({ label: 'retry', variant: 'warning' });
          }
        }

        const duplicateCandidates = [
          entry?.duplicate,
          entry?.is_duplicate,
          entry?.context?.duplicate,
          entry?.context?.is_duplicate,
          entry?.payload?.duplicate,
          entry?.payload?.is_duplicate,
        ];
        const hasDuplicate = duplicateCandidates.some((value) => {
          if (typeof value === 'boolean') {
            return value;
          }
          if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            return normalized === 'true' || normalized === 'duplicate';
          }
          return false;
        });
        if (hasDuplicate) {
          badges.push({ label: 'duplicate', variant: 'accent' });
        }

        return badges;
      }

      async function copyTextToClipboard(text) {
        if (!text) {
          throw new Error('Nothing to copy');
        }
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        try {
          const successful = document.execCommand('copy');
          if (!successful) {
            throw new Error('execCommand copy failed');
          }
        } finally {
          document.body.removeChild(textarea);
        }
      }

      function createCopyButton(getText) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'debug-copy-button';
        button.textContent = 'Copy';
        button.setAttribute('aria-label', 'Copy message');
        button.title = 'Copy message';

        const updateDisabledState = () => {
          try {
            const text = getText();
            button.disabled = !text;
          } catch (error) {
            button.disabled = true;
          }
        };

        updateDisabledState();

        let resetTimer = null;
        button.addEventListener('click', async () => {
          const originalText = 'Copy';
          const copiedText = 'Copied!';
          const errorText = 'Copy failed';
          window.clearTimeout(resetTimer);
          try {
            const text = getText();
            if (!text) {
              throw new Error('Nothing to copy');
            }
            await copyTextToClipboard(text);
            button.dataset.state = 'copied';
            button.textContent = copiedText;
          } catch (error) {
            console.error('Failed to copy message', error);
            button.dataset.state = 'error';
            button.textContent = errorText;
          }
          resetTimer = window.setTimeout(() => {
            button.dataset.state = '';
            button.textContent = originalText;
            updateDisabledState();
          }, 2000);
        });

        return button;
      }

      function buildDebugLogEntry(entry, { isFirstFailure = false } = {}) {
        const severity = getEntrySeverity(entry);
        const category = getEntryCategory(entry);
        const element = document.createElement('article');
        element.className = 'debug-log-entry';
        element.dataset.severity = severity;
        element.dataset.category = category;
        if (entry && typeof entry === 'object' && entry.id != null) {
          element.dataset.entryId = String(entry.id);
        }
        if (isFirstFailure) {
          element.classList.add('is-first-failure');
        }

        const timeline = document.createElement('div');
        timeline.className = 'debug-log-entry-timeline';
        const dot = document.createElement('div');
        dot.className = 'debug-log-entry-dot';
        timeline.appendChild(dot);
        element.appendChild(timeline);

        const body = document.createElement('div');
        body.className = 'debug-log-entry-body';
        element.appendChild(body);

        const header = document.createElement('header');
        header.className = 'debug-log-entry-header';
        body.appendChild(header);

        const title = document.createElement('div');
        title.className = 'debug-log-entry-title';
        header.appendChild(title);

        const severityBadge = document.createElement('span');
        severityBadge.className = 'debug-log-severity';
        severityBadge.dataset.variant = severity;
        severityBadge.textContent = severity;
        title.appendChild(severityBadge);

        const eventType = normalizeCorrelationValue(entry?.event_type || entry?.logger || entry?.category);
        if (eventType) {
          const badge = document.createElement('span');
          badge.className = 'debug-log-badge';
          badge.dataset.variant = 'accent';
          badge.textContent = eventType;
          title.appendChild(badge);
        }

        if (entry?.level != null && entry.level !== '') {
          const levelText =
            typeof entry.level === 'string' && entry.level.trim()
              ? entry.level.trim()
              : String(entry.level);
          if (levelText) {
            const levelBadge = document.createElement('span');
            levelBadge.className = 'debug-log-tag';
            levelBadge.textContent = levelText;
            title.appendChild(levelBadge);
          }
        }

        if (category && category !== 'app') {
          const categoryBadge = document.createElement('span');
          categoryBadge.className = 'debug-log-tag';
          categoryBadge.textContent = category;
          title.appendChild(categoryBadge);
        }

        const timestampSource =
          entry?.last_seen || entry?.first_seen || entry?.timestamp || entry?.time || entry?.created_at;
        const formattedTime = formatTimestamp(timestampSource);
        if (formattedTime) {
          const timeElement = document.createElement('span');
          timeElement.className = 'debug-log-time';
          timeElement.textContent = formattedTime;
          header.appendChild(timeElement);
        }

        const renderedValue =
          typeof entry?.rendered === 'string' && entry.rendered
            ? entry.rendered
            : entry?.message != null
            ? entry.message
            : '';
        const messageText =
          typeof renderedValue === 'string' ? renderedValue : String(renderedValue ?? '');
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'debug-log-message-wrapper';
        const messageElement = document.createElement('div');
        messageElement.className = 'debug-log-message';
        messageElement.textContent = messageText;
        messageWrapper.appendChild(messageElement);
        const copyButton = createCopyButton(() => messageElement.textContent || '');
        messageWrapper.appendChild(copyButton);
        body.appendChild(messageWrapper);

        const meta = document.createElement('div');
        meta.className = 'debug-log-entry-meta';
        const correlationLabels = [
          ['request_id', 'req'],
          ['job_id', 'job'],
          ['actor', 'actor'],
          ['correlation_id', 'corr'],
          ['task_id', 'task'],
          ['trace_id', 'trace'],
        ];
        const seenCorrelation = new Set();
        correlationLabels.forEach(([key, label]) => {
          const value = getEntryCorrelation(entry, key);
          if (value && !seenCorrelation.has(`${key}:${value}`)) {
            seenCorrelation.add(`${key}:${value}`);
            const tag = document.createElement('span');
            tag.className = 'debug-log-tag';
            tag.textContent = `${label} ${value}`;
            meta.appendChild(tag);
          }
        });

        const correlations = collectEntryCorrelations(entry);
        correlations.forEach((value) => {
          if (!seenCorrelation.has(value)) {
            seenCorrelation.add(value);
            const tag = document.createElement('span');
            tag.className = 'debug-log-tag';
            tag.textContent = value;
            meta.appendChild(tag);
          }
        });

        const badges = extractEntryBadges(entry);
        if (badges.length) {
          const badgeRow = document.createElement('div');
          badgeRow.className = 'debug-log-entry-badges';
          badges.forEach((badge) => {
            const badgeElement = document.createElement('span');
            badgeElement.className = 'debug-log-badge';
            if (badge.variant) {
              badgeElement.dataset.variant = badge.variant;
            }
            badgeElement.textContent = badge.label;
            badgeRow.appendChild(badgeElement);
          });
          meta.appendChild(badgeRow);
        }

        if (meta.childElementCount > 0) {
          body.appendChild(meta);
        }

        const detailTags = summarizeEntryDetails(entry);
        if (detailTags.length) {
          const detailRow = document.createElement('div');
          detailRow.className = 'debug-log-context';
          detailTags.slice(0, 8).forEach((detail) => {
            const detailTag = document.createElement('span');
            detailTag.className = 'debug-log-tag';
            detailTag.textContent = detail;
            detailRow.appendChild(detailTag);
          });
          body.appendChild(detailRow);
        }

        const stackTrace = extractStackTrace(entry);
        const contextJson = extractCombinedContext(entry);
        if (stackTrace || contextJson) {
          const expandable = document.createElement('details');
          expandable.className = 'debug-log-entry-expandable';
          if (severity === 'error' || severity === 'critical') {
            expandable.dataset.variant = 'error';
          }
          const summary = document.createElement('summary');
          if (stackTrace && contextJson) {
            summary.textContent = 'View stack trace & context';
          } else if (stackTrace) {
            summary.textContent = 'View stack trace';
          } else {
            summary.textContent = 'View context';
          }
          expandable.appendChild(summary);

          if (stackTrace) {
            const stackBlock = document.createElement('div');
            stackBlock.className = 'debug-log-entry-expandable-block';
            const stackLabel = document.createElement('div');
            stackLabel.className = 'debug-log-entry-expandable-label';
            stackLabel.textContent = 'Stack trace';
            const stackPre = document.createElement('pre');
            stackPre.textContent = stackTrace;
            stackBlock.appendChild(stackLabel);
            stackBlock.appendChild(stackPre);
            expandable.appendChild(stackBlock);
          }

          if (contextJson) {
            const contextBlock = document.createElement('div');
            contextBlock.className = 'debug-log-entry-expandable-block';
            const contextLabel = document.createElement('div');
            contextLabel.className = 'debug-log-entry-expandable-label';
            contextLabel.textContent = 'Context';
            const contextPre = document.createElement('pre');
            contextPre.textContent = contextJson;
            contextBlock.appendChild(contextLabel);
            contextBlock.appendChild(contextPre);
            expandable.appendChild(contextBlock);
          }

          body.appendChild(expandable);
        }

        return element;
      }

      function buildDebugStreamEntry(entry) {
        const severity = getEntrySeverity(entry);
        const element = document.createElement('div');
        element.className = 'debug-stream-entry';
        element.dataset.severity = severity;

        const header = document.createElement('div');
        header.className = 'debug-stream-entry-header';
        const title = document.createElement('span');
        title.className = 'debug-stream-entry-title';
        title.textContent = normalizeCorrelationValue(
          entry?.event_type || entry?.logger || entry?.category || 'event',
        );
        header.appendChild(title);

        const timestamp =
          entry?.timestamp || entry?.last_seen || entry?.first_seen || entry?.time || entry?.created_at;
        const formattedTime = formatTimestamp(timestamp);
        if (formattedTime) {
          const timeElement = document.createElement('span');
          timeElement.className = 'debug-stream-entry-time';
          timeElement.textContent = formattedTime;
          header.appendChild(timeElement);
        }
        element.appendChild(header);

        const rendered =
          typeof entry?.message === 'string' && entry.message
            ? entry.message
            : typeof entry?.rendered === 'string'
            ? entry.rendered
            : entry?.message != null
            ? String(entry.message)
            : '';
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'debug-stream-entry-message-wrapper';
        const messageElement = document.createElement('div');
        messageElement.className = 'debug-stream-entry-message';
        messageElement.textContent =
          typeof rendered === 'string' ? rendered : String(rendered ?? '');
        messageWrapper.appendChild(messageElement);
        const copyButton = createCopyButton(() => messageElement.textContent || '');
        messageWrapper.appendChild(copyButton);
        element.appendChild(messageWrapper);

        const meta = document.createElement('div');
        meta.className = 'debug-stream-entry-meta';
        const statusValue =
          entry?.status != null ? entry.status : entry?.context?.status ?? entry?.payload?.status;
        const statusText =
          typeof statusValue === 'string'
            ? statusValue
            : statusValue != null
            ? String(statusValue)
            : '';
        if (statusText) {
          const statusTag = document.createElement('span');
          statusTag.className = 'debug-log-tag';
          statusTag.textContent = `status ${statusText}`;
          meta.appendChild(statusTag);
        }
        const phaseValue = entry?.context?.phase || entry?.payload?.phase || entry?.phase;
        const phaseText =
          typeof phaseValue === 'string'
            ? phaseValue
            : phaseValue != null
            ? String(phaseValue)
            : '';
        if (phaseText) {
          const phaseTag = document.createElement('span');
          phaseTag.className = 'debug-log-tag';
          phaseTag.textContent = `phase ${phaseText}`;
          meta.appendChild(phaseTag);
        }
        const correlations = collectEntryCorrelations(entry);
        correlations.slice(0, 3).forEach((value) => {
          const tag = document.createElement('span');
          tag.className = 'debug-log-tag';
          tag.textContent = value;
          meta.appendChild(tag);
        });
        const badges = extractEntryBadges(entry);
        badges.forEach((badge) => {
          const badgeElement = document.createElement('span');
          badgeElement.className = 'debug-log-badge';
          if (badge.variant) {
            badgeElement.dataset.variant = badge.variant;
          }
          badgeElement.textContent = badge.label;
          meta.appendChild(badgeElement);
        });
        if (meta.childElementCount > 0) {
          element.appendChild(meta);
        }

        if (entry?.error != null && entry.error !== '') {
          const errorText =
            typeof entry.error === 'string' ? entry.error : String(entry.error);
          const errorLine = document.createElement('div');
          errorLine.className = 'debug-stream-entry-error';
          errorLine.textContent = errorText;
          element.appendChild(errorLine);
        }

        return element;
      }

      function renderDebugHeartbeat(entries, firstFailureIndex) {
        if (!dom.debugHeartbeat || !dom.debugHeartbeatTrack) {
          return;
        }
        const track = dom.debugHeartbeatTrack;
        track.innerHTML = '';
        if (!Array.isArray(entries) || entries.length === 0) {
          dom.debugHeartbeat.dataset.state = 'idle';
          return;
        }
        dom.debugHeartbeat.dataset.state = 'active';
        const maxDots = 60;
        const startIndex = Math.max(0, entries.length - maxDots);
        const visible = entries.slice(startIndex);
        let highlightIndex = firstFailureIndex;
        if (highlightIndex < startIndex) {
          highlightIndex = -1;
          for (let index = startIndex; index < entries.length; index += 1) {
            if (isEntryFailure(entries[index])) {
              highlightIndex = index;
              break;
            }
          }
        }
        const fragment = document.createDocumentFragment();
        visible.forEach((entry, index) => {
          const absoluteIndex = startIndex + index;
          const dot = document.createElement('span');
          dot.className = 'debug-heartbeat-dot';
          dot.dataset.severity = getEntrySeverity(entry);
          const timestampSource = entry?.last_seen || entry?.first_seen || entry?.timestamp || entry?.time;
          const formattedTime = formatTimestamp(timestampSource);
          const eventType = normalizeCorrelationValue(entry?.event_type || entry?.logger || entry?.category);
          const messageSource =
            typeof entry?.message === 'string'
              ? entry.message
              : entry?.message != null
              ? String(entry.message)
              : '';
          const messageSnippet = messageSource ? messageSource.slice(0, 80) : '';
          const parts = [formattedTime, eventType, messageSnippet].filter(Boolean);
          if (parts.length) {
            dot.title = parts.join(' · ');
          }
          if (absoluteIndex === highlightIndex) {
            dot.classList.add('is-failure');
          }
          fragment.appendChild(dot);
        });
        track.appendChild(fragment);
      }

      function renderDebugLogs() {
        if (!dom.debugLog) {
          return;
        }
        ensureDebugPlaceholder();
        const entries = Array.isArray(state.debug.entries)
          ? state.debug.entries.slice(-MAX_DEBUG_LOG_ENTRIES)
          : [];
        const filtered = applyDebugFilters(entries);
        const firstFailureIndex = filtered.findIndex((entry) => isEntryFailure(entry));
        renderDebugHeartbeat(filtered, firstFailureIndex);
        const container = dom.debugLog;
        const existing = Array.from(container.children).filter((child) => child !== dom.debugEmpty);
        existing.forEach((child) => {
          container.removeChild(child);
        });
        const hasServerEntries = Array.isArray(state.debug.serverEntries)
          ? state.debug.serverEntries.length > 0
          : false;
        const hasTaskEntries = Array.isArray(state.debug.tasks)
          ? state.debug.tasks.length > 0
          : false;
        if (!filtered.length) {
          if (dom.debugEmpty) {
            if (hasActiveFilters()) {
              dom.debugEmpty.textContent = FILTERED_DEBUG_EMPTY_TEXT;
              dom.debugEmpty.hidden = false;
            } else {
              dom.debugEmpty.textContent = DEFAULT_DEBUG_EMPTY_TEXT;
              dom.debugEmpty.hidden = hasServerEntries || hasTaskEntries;
            }
          }
          if (state.debug.autoScroll) {
            container.scrollTop = container.scrollHeight;
          }
          return;
        }

        if (dom.debugEmpty) {
          dom.debugEmpty.textContent = DEFAULT_DEBUG_EMPTY_TEXT;
          dom.debugEmpty.hidden = true;
        }

        const fragment = document.createDocumentFragment();
        filtered.forEach((entry, index) => {
          fragment.appendChild(
            buildDebugLogEntry(entry, { isFirstFailure: index === firstFailureIndex }),
          );
        });
        container.appendChild(fragment);

        if (state.debug.autoScroll) {
          container.scrollTop = container.scrollHeight;
        }
      }

      function setDebugFilter(field, value) {
        const filters = state.debug.filters || {
          severity: 'all',
          category: 'all',
          correlationId: '',
          taskId: '',
          query: '',
        };
        let next = typeof value === 'string' ? value.trim() : '';
        if ((field === 'severity' || field === 'category') && !next) {
          next = 'all';
        }
        if (filters[field] === next) {
          return;
        }
        state.debug.filters = {
          ...filters,
          [field]: next,
        };
        renderDebugLogs();
      }

      function normalizeServerEntry(entry) {
        if (entry == null) {
          return null;
        }
        if (typeof entry === 'string') {
          return {
            id: `server-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            category: SERVER_LOG_CATEGORY,
            severity: 'info',
            event_type: 'server',
            timestamp: new Date().toISOString(),
            message: entry,
            context: {},
            payload: {},
          };
        }
        if (typeof entry !== 'object') {
          return null;
        }
        const message =
          typeof entry.message === 'string' && entry.message
            ? entry.message
            : typeof entry.rendered === 'string'
            ? entry.rendered
            : '';
        const timestamp =
          entry.last_seen ||
          entry.first_seen ||
          entry.timestamp ||
          entry.time ||
          entry.created_at ||
          '';
        return {
          id:
            entry.id != null
              ? `server-${entry.id}`
              : `server-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          category: normalizeFilterValue(entry.category) || SERVER_LOG_CATEGORY,
          severity: getEntrySeverity(entry),
          event_type: entry.event_type || entry.logger || 'server',
          timestamp,
          message,
          context: typeof entry.context === 'object' && entry.context ? entry.context : {},
          payload: typeof entry.payload === 'object' && entry.payload ? entry.payload : {},
          error: entry.error,
          stack: entry.stack,
        };
      }

      function normalizeTaskEntry(entry) {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const payload = typeof entry.payload === 'object' && entry.payload ? entry.payload : {};
        const rawTaskId =
          payload.task_id ||
          entry.task_id ||
          entry.taskId ||
          payload.job_id ||
          entry.id;
        const taskId = normalizeCorrelationValue(rawTaskId) || `task-${Date.now()}`;
        const statusValue = payload.status || payload.phase || entry.status || entry.level || '';
        const normalizedStatus = normalizeFilterValue(statusValue);
        let severity = getEntrySeverity(entry);
        if (normalizedStatus === 'failed' || normalizedStatus === 'failure' || normalizedStatus === 'error') {
          severity = 'error';
        } else if (normalizedStatus === 'warning' || normalizedStatus === 'warn') {
          severity = 'warning';
        }
        const timestamp =
          payload.updated_at ||
          payload.completed_at ||
          payload.started_at ||
          entry.last_seen ||
          entry.timestamp ||
          entry.time ||
          entry.created_at ||
          '';
        const message =
          payload.message ||
          payload.step ||
          entry.message ||
          entry.rendered ||
          '';
        const context = {
          status: statusValue || '',
          phase: payload.phase || '',
          task_id: taskId,
          lecture_id: payload.lecture_id || '',
        };
        const updatedAt = (() => {
          const candidate = Date.parse(timestamp || '');
          if (!Number.isNaN(candidate)) {
            return candidate;
          }
          return Date.now();
        })();
        const normalized = {
          id: taskId,
          taskId,
          category: 'task',
          severity,
          status: statusValue || '',
          event_type: payload.operation || entry.event_type || 'task',
          timestamp,
          message,
          context,
          payload,
          updatedAt,
        };
        if (payload.error || entry.error) {
          normalized.error = payload.error || entry.error;
        }
        if (entry.exception) {
          normalized.exception = entry.exception;
        }
        return normalized;
      }

      function updateDebugStatus(message) {
        if (!dom.debugStatus) {
          return;
        }
        if (message) {
            dom.debugStatus.hidden = false;
            dom.debugStatus.textContent = message;
          } else {
            dom.debugStatus.hidden = true;
            dom.debugStatus.textContent = '';
          }
        }

        function updateServerStream(serverEntries, taskEntries, { reset = false } = {}) {
          if (reset || !Array.isArray(state.debug.serverEntries)) {
            state.debug.serverEntries = [];
          }
          if (reset || !Array.isArray(state.debug.tasks)) {
            state.debug.tasks = [];
          }

          const normalizedServerEntries = Array.isArray(serverEntries)
            ? serverEntries.map((entry) => normalizeServerEntry(entry)).filter(Boolean)
            : [];
          const existingServerEntries = Array.isArray(state.debug.serverEntries)
            ? state.debug.serverEntries.map((entry) => normalizeServerEntry(entry)).filter(Boolean)
            : [];
          state.debug.serverEntries = existingServerEntries
            .concat(normalizedServerEntries)
            .slice(-MAX_SERVER_STREAM_ENTRIES);

          const normalizedTaskEntries = Array.isArray(taskEntries)
            ? taskEntries.map((entry) => normalizeTaskEntry(entry)).filter(Boolean)
            : [];
          const existingTasks = Array.isArray(state.debug.tasks)
            ? state.debug.tasks.map((task) => normalizeTaskEntry(task)).filter(Boolean)
            : [];
          if (normalizedTaskEntries.length) {
            const existing = new Map();
            existingTasks.forEach((task) => {
              if (task && task.taskId) {
                existing.set(task.taskId, task);
              }
            });
            normalizedTaskEntries.forEach((task) => {
              existing.set(task.taskId, task);
            });
            state.debug.tasks = Array.from(existing.values())
              .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
              .slice(0, MAX_SERVER_STREAM_ENTRIES);
          } else {
            state.debug.tasks = existingTasks.slice(0, MAX_SERVER_STREAM_ENTRIES);
          }

          if (!dom.debugStreamEntries) {
            return;
          }

          dom.debugStreamEntries.innerHTML = '';
          const hasTasks = Array.isArray(state.debug.tasks) && state.debug.tasks.length > 0;
          const hasServerMessages =
            Array.isArray(state.debug.serverEntries) && state.debug.serverEntries.length > 0;
          if (!hasTasks && !hasServerMessages) {
            if (dom.debugStreamEmpty) {
              dom.debugStreamEmpty.hidden = false;
              dom.debugStreamEntries.appendChild(dom.debugStreamEmpty);
            }
            return;
          }

          if (dom.debugStreamEmpty) {
            dom.debugStreamEmpty.hidden = true;
          }

          const fragment = document.createDocumentFragment();
          if (hasTasks) {
            state.debug.tasks.forEach((task) => {
              fragment.appendChild(buildDebugStreamEntry(task));
            });
          }
          if (hasServerMessages) {
            state.debug.serverEntries.forEach((entry) => {
              fragment.appendChild(buildDebugStreamEntry(entry));
            });
          }
          dom.debugStreamEntries.appendChild(fragment);
        }

        function appendDebugLogs(entries, { reset = false } = {}) {
          if (!dom.debugLog) {
            return;
          }
          const list = Array.isArray(entries) ? entries : [];
          const serverLogs = [];
          const taskLogs = [];
          const regularLogs = [];
          list.forEach((entry) => {
            if (!entry || typeof entry !== 'object') {
              return;
            }
            if (entry.category === SERVER_LOG_CATEGORY) {
              serverLogs.push(entry);
              return;
            }
            if (entry.category === 'task') {
              taskLogs.push(entry);
              return;
            }
            regularLogs.push(entry);
          });

          updateServerStream(serverLogs, taskLogs, { reset });
          if (reset || !Array.isArray(state.debug.entries)) {
            state.debug.entries = [];
          }
          if (regularLogs.length) {
            state.debug.entries = state.debug.entries
              .concat(regularLogs)
              .slice(-MAX_DEBUG_LOG_ENTRIES);
          }
          renderDebugLogs();
        }

        async function fetchDebugLogs(reset = false) {
          if (!state.debug.enabled || state.debug.pending) {
            return;
          }
          state.debug.pending = true;
          try {
            let url = '/api/debug/logs';
            if (!reset && state.debug.lastId) {
              url += `?after=${encodeURIComponent(state.debug.lastId)}`;
            }
            const payload = await request(url);
            const logs = Array.isArray(payload?.logs) ? payload.logs : [];
            appendDebugLogs(logs, { reset });
            if (typeof payload?.next === 'number') {
              state.debug.lastId = payload.next;
            } else if (logs.length) {
              const lastEntry = logs[logs.length - 1];
              if (lastEntry && typeof lastEntry.id === 'number') {
                state.debug.lastId = lastEntry.id;
              }
            }
            updateDebugStatus('');
          } catch (error) {
            const base = t('debug.error');
            const detail = error instanceof Error ? error.message : String(error || '');
            updateDebugStatus(detail ? `${base} ${detail}` : base);
          } finally {
            state.debug.pending = false;
          }
        }

        function startDebugPolling() {
          stopDebugPolling();
          if (!state.debug.enabled) {
            return;
          }
          fetchDebugLogs(state.debug.lastId === 0);
          state.debug.timer = window.setInterval(() => {
            fetchDebugLogs(false);
          }, DEBUG_POLL_INTERVAL_MS);
        }

        function stopDebugPolling() {
          if (state.debug.timer) {
            window.clearInterval(state.debug.timer);
            state.debug.timer = null;
          }
        }

        function setDebugMode(enabled) {
          const active = Boolean(enabled);
          if (state.debug.enabled === active) {
            document.body.classList.toggle('debug-enabled', active);
            if (dom.debugPane) {
              dom.debugPane.hidden = !active;
            }
            if (active && state.debug.timer === null) {
              startDebugPolling();
            }
            return;
          }

          state.debug.enabled = active;
          document.body.classList.toggle('debug-enabled', active);
          if (dom.debugPane) {
            dom.debugPane.hidden = !active;
          }

          if (active) {
            state.debug.lastId = 0;
            state.debug.autoScroll = true;
            state.debug.pending = false;
            appendDebugLogs([], { reset: true });
            updateDebugStatus('');
            startDebugPolling();
          } else {
            stopDebugPolling();
            updateDebugStatus('');
            updateServerStream([], [], { reset: true });
            state.debug.entries = [];
            renderDebugLogs();
            if (dom.debugEmpty) {
              ensureDebugPlaceholder();
              dom.debugEmpty.hidden = false;
            }
          }
        }

        const dialogState = { active: false, uploadActive: false };

        let pdfjsLibPromise = null;

        function loadPdfjsLib() {
          if (window.pdfjsLib) {
            return Promise.resolve(window.pdfjsLib);
          }
          if (pdfjsLibPromise) {
            return pdfjsLibPromise;
          }

          const scriptUrl = window.__LECTURE_TOOLS_PDFJS_SCRIPT_URL__;
          if (typeof scriptUrl !== 'string' || !scriptUrl) {
            return Promise.reject(new Error('PDF.js script URL not configured.'));
          }

          const existingScript = document.querySelector('script[data-pdfjs-loader="true"]');
          if (existingScript && !window.pdfjsLib) {
            pdfjsLibPromise = new Promise((resolve, reject) => {
              const handleLoad = () => {
                if (window.pdfjsLib) {
                  try {
                    const workerUrl = window.__LECTURE_TOOLS_PDFJS_WORKER_URL__;
                    if (workerUrl) {
                      window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
                    }
                  } catch (workerError) {
                    console.warn('Unable to configure PDF.js worker', workerError);
                  }
                  resolve(window.pdfjsLib);
                } else {
                  reject(new Error('PDF.js did not expose pdfjsLib.'));
                }
              };
              existingScript.addEventListener('load', handleLoad, { once: true });
              existingScript.addEventListener(
                'error',
                () => reject(new Error('Failed to load PDF.js script.')),
                { once: true },
              );
            }).catch((error) => {
              pdfjsLibPromise = null;
              throw error;
            });
            return pdfjsLibPromise;
          }

          pdfjsLibPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptUrl;
            script.async = true;
            script.dataset.pdfjsLoader = 'true';
            script.onload = () => {
              if (window.pdfjsLib) {
                try {
                  const workerUrl = window.__LECTURE_TOOLS_PDFJS_WORKER_URL__;
                  if (workerUrl) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
                  }
                } catch (workerError) {
                  console.warn('Unable to configure PDF.js worker', workerError);
                }
                resolve(window.pdfjsLib);
              } else {
                reject(new Error('PDF.js did not expose pdfjsLib.'));
              }
            };
            script.onerror = () => {
              reject(new Error('Failed to load PDF.js script.'));
            };
            document.head.appendChild(script);
          }).catch((error) => {
            pdfjsLibPromise = null;
            throw error;
          });

          return pdfjsLibPromise;
        }

        async function extractPdfPageCountFromBlob(blob) {
          if (!(blob instanceof Blob)) {
            return null;
          }
          try {
            const pdfjs = await loadPdfjsLib();
            const data = await blob.arrayBuffer();
            const loadingTask = pdfjs.getDocument({ data });
            try {
              const pdfDocument = await loadingTask.promise;
              const totalPages = pdfDocument?.numPages;
              if (typeof pdfDocument?.destroy === 'function') {
                try {
                  await pdfDocument.destroy();
                } catch (destroyError) {
                  console.warn('Failed to destroy PDF document', destroyError);
                }
              }
              if (Number.isFinite(totalPages) && totalPages > 0) {
                return Math.round(totalPages);
              }
            } finally {
              if (typeof loadingTask.destroy === 'function') {
                try {
                  await loadingTask.destroy();
                } catch (taskError) {
                  // Ignore cleanup failures.
                }
              }
            }
          } catch (error) {
            console.warn('Failed to read PDF page count from blob', error);
          }
          return null;
        }

        async function extractPdfPageCountFromUrl(url, { withCredentials = false } = {}) {
          if (typeof url !== 'string' || !url) {
            return null;
          }
          try {
            const pdfjs = await loadPdfjsLib();
            const loadingTask = pdfjs.getDocument({ url, withCredentials });
            try {
              const pdfDocument = await loadingTask.promise;
              const totalPages = pdfDocument?.numPages;
              if (typeof pdfDocument?.destroy === 'function') {
                try {
                  await pdfDocument.destroy();
                } catch (destroyError) {
                  console.warn('Failed to destroy PDF document', destroyError);
                }
              }
              if (Number.isFinite(totalPages) && totalPages > 0) {
                return Math.round(totalPages);
              }
            } finally {
              if (typeof loadingTask.destroy === 'function') {
                try {
                  await loadingTask.destroy();
                } catch (taskError) {
                  // Ignore cleanup failures.
                }
              }
            }
          } catch (error) {
            console.warn('Failed to read PDF page count from URL', error);
          }
          return null;
        }

        function showPendingOverlay(message = '') {
          const pending = dom.pendingDialog;
          if (!pending || !pending.root) {
            return;
          }
          if (pending.message) {
            pending.message.textContent = message || '';
          }
          pending.root.classList.remove('hidden');
          pending.root.setAttribute('aria-hidden', 'false');
        }

        function hidePendingOverlay() {
          const pending = dom.pendingDialog;
          if (!pending || !pending.root) {
            return;
          }
          pending.root.classList.add('hidden');
          pending.root.setAttribute('aria-hidden', 'true');
          if (pending.message) {
            pending.message.textContent = '';
          }
        }


        function syncSettingsForm(settings) {
          const themeValue = settings?.theme ?? 'system';
          const languageValue = normalizeLanguage(settings?.language);
          const requestedModel = normalizeWhisperModel(settings?.whisper_model);
          const computeRaw = settings?.whisper_compute_type ?? 'int8';
          const computeValue =
            typeof computeRaw === 'string' ? computeRaw.trim() || 'int8' : 'int8';
          const beamNumber = Math.max(
            1,
            Math.min(10, Number(settings?.whisper_beam_size) || 5),
          );
          const dpiValue = normalizeSlideDpi(settings?.slide_dpi);
          const masteringEnabled = settings?.audio_mastering_enabled !== false;
          const debugEnabled = Boolean(settings?.debug_enabled);

          const effectiveModel =
            requestedModel === GPU_MODEL && !state.gpuWhisper.supported
              ? DEFAULT_WHISPER_MODEL
              : requestedModel;

          dom.settingsTheme.value = themeValue;
          dom.settingsLanguage.value = languageValue;
          dom.settingsWhisperModel.value = effectiveModel;
          dom.settingsWhisperCompute.value = computeValue;
          dom.settingsWhisperBeam.value = String(beamNumber);
          dom.settingsSlideDpi.value = dpiValue;
          if (dom.settingsAudioMastering) {
            dom.settingsAudioMastering.checked = masteringEnabled;
          }
          if (dom.settingsDebugEnabled) {
            dom.settingsDebugEnabled.checked = debugEnabled;
          }
          setTranscribeModelValue(effectiveModel);

          state.settings = {
            theme: themeValue,
            language: languageValue,
            whisper_model: effectiveModel,
            whisper_model_requested: requestedModel,
            whisper_compute_type: computeValue,
            whisper_beam_size: beamNumber,
            slide_dpi: Number(dpiValue),
            audio_mastering_enabled: masteringEnabled,
            debug_enabled: debugEnabled,
          };

          applyTheme(themeValue);
          updateGpuWhisperUI({ ...state.gpuWhisper });
          applyTranslations(languageValue);
          renderStorage();
          updateEditModeUI();
          setDebugMode(debugEnabled);
        }

        function showDialog({
          title = '',
          message = '',
          confirmText = t('dialog.confirm'),
          cancelText = t('dialog.cancel'),
          variant = 'primary',
          input = false,
          placeholder = '',
          defaultValue = '',
          required = false,
        } = {}) {
          return new Promise((resolve) => {
            const dialog = dom.dialog;
            if (!dialog.root || dialogState.active || dialogState.uploadActive) {
              resolve({ confirmed: false, value: null });
              return;
            }

            dialogState.active = true;
            const previousActive =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const requireValue = Boolean(required && input);
            const variantClass = variant === 'danger' ? 'danger' : 'primary';

            dialog.title.textContent = title || '';
            dialog.message.textContent = message || '';
            dialog.message.style.display = message ? 'block' : 'none';

            if (input) {
              dialog.inputWrapper.classList.remove('hidden');
              dialog.input.value = defaultValue ?? '';
              dialog.input.placeholder = placeholder ?? '';
            } else {
              dialog.inputWrapper.classList.add('hidden');
              dialog.input.value = '';
              dialog.input.placeholder = '';
            }

            dialog.confirm.textContent = confirmText;
            dialog.cancel.textContent = cancelText;
            dialog.confirm.classList.remove('primary', 'danger');
            dialog.confirm.classList.add(variantClass);
            dialog.confirm.disabled = false;

            const focusOrder = [];
            if (input) {
              focusOrder.push(dialog.input);
            }
            focusOrder.push(dialog.cancel, dialog.confirm);

            function updateConfirmState() {
              if (!requireValue) {
                dialog.confirm.disabled = false;
                return;
              }
              dialog.confirm.disabled = dialog.input.value.trim().length === 0;
            }

            function cleanup() {
              dialog.confirm.removeEventListener('click', handleConfirm);
              dialog.cancel.removeEventListener('click', handleCancel);
              dialog.backdrop.removeEventListener('click', handleCancel);
              dialog.window.removeEventListener('keydown', handleKeyDown);
              if (input) {
                dialog.input.removeEventListener('input', updateConfirmState);
              }
              dialog.root.classList.add('hidden');
              dialog.root.setAttribute('aria-hidden', 'true');
              document.body.classList.remove('dialog-open');
              dialogState.active = false;
              if (previousActive) {
                previousActive.focus({ preventScroll: true });
              }
            }

            function resolveAndClose(result) {
              cleanup();
              resolve(result);
            }

            function handleConfirm(event) {
              event.preventDefault();
              if (dialog.confirm.disabled) {
                return;
              }
              const value = input ? dialog.input.value : null;
              resolveAndClose({ confirmed: true, value });
            }

            function handleCancel(event) {
              event.preventDefault();
              resolveAndClose({ confirmed: false, value: null });
            }

            function handleKeyDown(event) {
              if (event.key === 'Escape') {
                event.preventDefault();
                handleCancel(event);
                return;
              }
              if (event.key === 'Enter') {
                if (input) {
                  if (requireValue && dialog.input.value.trim().length === 0) {
                    return;
                  }
                  if (document.activeElement !== dialog.cancel) {
                    event.preventDefault();
                    handleConfirm(event);
                  }
                } else if (
                  document.activeElement !== dialog.confirm &&
                  document.activeElement !== dialog.cancel
                ) {
                  event.preventDefault();
                  handleConfirm(event);
                }
                return;
              }
              if (event.key === 'Tab') {
                const focusable = focusOrder.filter(
                  (element) => element instanceof HTMLElement && !element.disabled,
                );
                if (!focusable.length) {
                  return;
                }
                const currentIndex = focusable.indexOf(document.activeElement);
                if (event.shiftKey) {
                  const previousIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
                  focusable[previousIndex].focus();
                } else {
                  const nextIndex = currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
                  focusable[nextIndex].focus();
                }
                event.preventDefault();
              }
            }

            dialog.confirm.addEventListener('click', handleConfirm);
            dialog.cancel.addEventListener('click', handleCancel);
            dialog.backdrop.addEventListener('click', handleCancel);
            dialog.window.addEventListener('keydown', handleKeyDown);
            if (input) {
              dialog.input.addEventListener('input', updateConfirmState);
            }

            dialog.root.classList.remove('hidden');
            dialog.root.setAttribute('aria-hidden', 'false');
            document.body.classList.add('dialog-open');
            updateConfirmState();

            const initialFocus = input ? dialog.input : dialog.confirm;
            window.requestAnimationFrame(() => {
              initialFocus.focus({ preventScroll: true });
              if (input) {
                const valueLength = dialog.input.value.length;
                dialog.input.setSelectionRange(valueLength, valueLength);
              }
            });
          });
        }

        async function confirmDialog(options = {}) {
          const result = await showDialog({ ...options, input: false });
          return Boolean(result.confirmed);
        }

        async function promptDialog(options = {}) {
          const result = await showDialog({ ...options, input: true });
          if (!result.confirmed) {
            return null;
          }
          return typeof result.value === 'string' ? result.value : '';
        }

        async function showUploadDialog(options = {}) {
          return new Promise((resolve) => {
            const dialog = dom.uploadDialog;
            if (!dialog || !dialog.root || dialogState.uploadActive) {
              resolve({ confirmed: false, uploaded: false, file: null, result: null, meta: null });
              return;
            }

            dialogState.uploadActive = true;
            let closed = false;
            let selectedFile = null;
            let selectedMeta = null;
            let selectedCleanup = null;
            let selecting = false;
            let uploading = false;
            let uploadComplete = false;
            let uploadResult = null;
            let uploadStage = 'idle';
            let processingInBackground = false;
            let autoCloseOnComplete = false;

            const allowBackgroundProcessing = options.allowBackgroundProcessing === true;
            const enableProcessingStage = options.enableProcessingStage !== false;
            const backgroundProcessingMessage =
              typeof options.backgroundProcessing === 'string' ? options.backgroundProcessing : '';

            const actionLabelCandidate =
              options.uploadLabel ||
              t('dialogs.upload.action') ||
              t('common.actions.upload');
            const labels = {
              title: options.title || t('dialogs.upload.title'),
              description: options.description || t('dialogs.upload.description'),
              prompt: options.prompt || t('dialogs.upload.prompt'),
              help: options.help || t('dialogs.upload.help'),
              browse: options.browseLabel || t('dialogs.upload.browse'),
              clear: options.clearLabel || t('dialogs.upload.clear'),
              waiting: options.waiting || t('dialogs.upload.waiting'),
              preparing: options.preparing || t('dialogs.upload.preparing'),
              uploading: options.uploading || t('dialogs.upload.uploading'),
              processing: options.processing || t('dialogs.upload.processing'),
              processingAction:
                options.processingAction || t('dialogs.upload.processingAction'),
              backgroundProcessing:
                backgroundProcessingMessage || t('dialogs.upload.backgroundProcessing'),
              success: options.success || t('dialogs.upload.success'),
              failure: options.failure || t('dialogs.upload.failure'),
              progress: options.progressLabel || t('dialogs.upload.progress'),
              action: actionLabelCandidate || 'Upload',
              close: options.closeLabel || t('common.actions.close') || 'Close',
            };

            const accept = typeof options.accept === 'string' ? options.accept : '';
            const uploadHandler = typeof options.onUpload === 'function' ? options.onUpload : null;
            const fileSelectedHandler =
              typeof options.onFileSelected === 'function' ? options.onFileSelected : null;

            const previousActive =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;

            function cleanup() {
              closed = true;
              if (dialog.confirm) {
                dialog.confirm.removeEventListener('click', handleConfirm);
              }
              if (dialog.cancel) {
                dialog.cancel.removeEventListener('click', handleCancel);
              }
              if (dialog.backdrop) {
                dialog.backdrop.removeEventListener('click', handleCancel);
              }
              if (dialog.window) {
                dialog.window.removeEventListener('keydown', handleKeyDown);
              }
              if (dialog.dropzone) {
                dialog.dropzone.removeEventListener('click', handleBrowseClick);
                dialog.dropzone.removeEventListener('keydown', handleDropzoneKeyDown);
                dialog.dropzone.removeEventListener('dragover', handleDragOver);
                dialog.dropzone.removeEventListener('dragleave', handleDragLeave);
                dialog.dropzone.removeEventListener('drop', handleDrop);
              }
              if (dialog.browse) {
                dialog.browse.removeEventListener('click', handleBrowseClick);
                dialog.browse.removeEventListener('keydown', handleDropzoneKeyDown);
              }
              if (dialog.input) {
                dialog.input.removeEventListener('change', handleInputChange);
              }
              if (dialog.clear) {
                dialog.clear.removeEventListener('click', handleClearSelection);
              }
              resetProgress();
              setStatus('');
              if (dialog.fileInfo) {
                dialog.fileInfo.classList.add('hidden');
              }
              if (dialog.fileName) {
                dialog.fileName.textContent = '';
              }
              if (dialog.fileSize) {
                dialog.fileSize.textContent = '';
              }
              if (dialog.dropzone) {
                dialog.dropzone.classList.remove('active');
              }
              if (dialog.input) {
                dialog.input.value = '';
              }
              if (dialog.root) {
                dialog.root.classList.add('hidden');
                dialog.root.classList.remove('upload-dialog-hidden');
                dialog.root.setAttribute('aria-hidden', 'true');
              }
              document.body.classList.remove('dialog-open');
              dialogState.uploadActive = false;
              selectedCleanup = null;
              if (previousActive) {
                previousActive.focus({ preventScroll: true });
              }
            }

            async function resolveAndClose(payload) {
              if (!payload || payload.uploaded !== true) {
                await runSelectedCleanup();
              }
              cleanup();
              resolve(payload);
            }

            function setStatus(message, variant = '') {
              if (!dialog.status) {
                return;
              }
              dialog.status.classList.remove('error', 'success');
              if (variant) {
                dialog.status.classList.add(variant);
              }
              dialog.status.textContent = message || '';
            }

            function resetProgress() {
              if (dialog.progressContainer) {
                dialog.progressContainer.classList.add('hidden');
              }
              if (dialog.progressFill) {
                dialog.progressFill.style.width = '0%';
              }
              if (dialog.progressText) {
                dialog.progressText.textContent = '';
              }
              if (dialog.progress) {
                dialog.progress.setAttribute('aria-valuenow', '0');
                dialog.progress.setAttribute('aria-label', labels.progress);
              }
              uploadStage = 'idle';
              processingInBackground = false;
              autoCloseOnComplete = false;
            }

            function updateProgress(ratio) {
              const value = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
              const percent = Math.round(value * 100);
              if (dialog.progressContainer) {
                dialog.progressContainer.classList.remove('hidden');
              }
              if (dialog.progressFill) {
                dialog.progressFill.style.width = `${percent}%`;
              }
              if (dialog.progressText) {
                dialog.progressText.textContent = `${percent}%`;
              }
              if (dialog.progress) {
                dialog.progress.setAttribute('aria-valuenow', String(percent));
              }
              if (percent >= 100) {
                autoCloseOnComplete = true;
                if (uploading && uploadStage === 'uploading') {
                  setStatus(labels.success, 'success');
                }
              }
              if (
                enableProcessingStage &&
                labels.processing &&
                uploading &&
                uploadStage !== 'processing' &&
                percent >= 100 &&
                !autoCloseOnComplete
              ) {
                uploadStage = 'processing';
                if (allowBackgroundProcessing) {
                  enterProcessingStage();
                } else {
                  setStatus(labels.processing);
                  updateActionState();
                }
              }
            }

            function enterProcessingStage() {
              if (processingInBackground || !allowBackgroundProcessing) {
                return;
              }
              processingInBackground = true;
              const message = labels.backgroundProcessing || labels.processing || labels.uploading;
              setStatus(message, 'info');
              updateActionState();
            }

            function updateActionState() {
              if (!dialog.confirm) {
                return;
              }
              dialog.confirm.classList.remove('hidden');
              dialog.confirm.style.display = '';
              if (processingInBackground && allowBackgroundProcessing && uploading) {
                dialog.confirm.textContent = labels.close;
                dialog.confirm.disabled = false;
                if (dialog.cancel) {
                  dialog.cancel.textContent = labels.close;
                  dialog.cancel.disabled = false;
                }
                return;
              }
              if (uploading) {
                const buttonLabel =
                  uploadStage === 'processing'
                    ? labels.processingAction || labels.processing || labels.uploading
                    : labels.uploading;
                dialog.confirm.textContent = buttonLabel;
                dialog.confirm.disabled = true;
                if (dialog.cancel) {
                  dialog.cancel.textContent = t('dialog.cancel');
                  dialog.cancel.disabled = true;
                }
                return;
              }
              if (uploadComplete) {
                dialog.confirm.textContent = t('dialog.confirm');
                dialog.confirm.disabled = false;
                if (dialog.cancel) {
                  dialog.cancel.textContent = t('dialog.cancel');
                  dialog.cancel.disabled = false;
                }
                return;
              }
              const readyLabel =
                labels.action || t('dialogs.upload.action') || t('common.actions.upload') || 'Upload';
              dialog.confirm.textContent = readyLabel;
              dialog.confirm.disabled = !selectedFile || !uploadHandler;
              if (dialog.cancel) {
                dialog.cancel.textContent = t('dialog.cancel');
                dialog.cancel.disabled = false;
              }
            }

            async function runWithSuspendedDialog(task) {
              if (typeof task !== 'function') {
                return null;
              }
              const pendingMessage =
                t('dialogs.slideRange.loading') ||
                labels.processing ||
                labels.uploading ||
                'Preparing document…';
              showPendingOverlay(pendingMessage);
              if (dialog.root) {
                dialog.root.classList.add('upload-dialog-hidden');
                dialog.root.setAttribute('aria-hidden', 'true');
              }
              document.body.classList.remove('dialog-open');
              dialogState.uploadActive = false;
              try {
                return await task();
              } finally {
                hidePendingOverlay();
                if (!closed) {
                  dialogState.uploadActive = true;
                  if (dialog.root) {
                    dialog.root.classList.remove('upload-dialog-hidden');
                    dialog.root.classList.remove('hidden');
                    dialog.root.setAttribute('aria-hidden', 'false');
                  }
                  document.body.classList.add('dialog-open');
                  window.requestAnimationFrame(() => {
                    if (!closed && dialog.dropzone instanceof HTMLElement) {
                      dialog.dropzone.focus({ preventScroll: true });
                    }
                  });
                } else {
                  document.body.classList.remove('dialog-open');
                }
              }
            }

            async function runSelectedCleanup() {
              const cleanupFn = selectedCleanup;
              selectedCleanup = null;
              if (typeof cleanupFn !== 'function') {
                return;
              }
              try {
                await cleanupFn();
              } catch (error) {
                console.warn('Failed to clear upload selection metadata', error);
              }
            }

            async function setSelectedFile(file) {
              if (selecting) {
                return;
              }
              selecting = true;
              try {
                if (!file) {
                  await runSelectedCleanup();
                  selectedFile = null;
                  selectedMeta = null;
                  if (dialog.fileInfo) {
                    dialog.fileInfo.classList.add('hidden');
                  }
                  if (dialog.fileName) {
                    dialog.fileName.textContent = '';
                  }
                  if (dialog.fileSize) {
                    dialog.fileSize.textContent = '';
                  }
                  if (dialog.input) {
                    dialog.input.value = '';
                  }
                  resetProgress();
                  setStatus(labels.waiting);
                  uploadComplete = false;
                  updateActionState();
                  return;
                }

                if (selectedCleanup) {
                  await runSelectedCleanup();
                }

                let meta = null;
                let summary = '';
                let cleanupFn = null;
                if (fileSelectedHandler) {
                  setStatus(labels.preparing);
                  try {
                    const result = await runWithSuspendedDialog(() => fileSelectedHandler(file));
                    if (closed) {
                      return;
                    }
                    if (
                      result === false ||
                      (result && result.cancelled === true) ||
                      (result && result.confirmed === false)
                    ) {
                      if (dialog.input) {
                        dialog.input.value = '';
                      }
                      setStatus(labels.waiting);
                      uploadComplete = false;
                      selectedFile = null;
                      selectedMeta = null;
                      updateActionState();
                      return;
                    }
                    if (result && typeof result === 'object' && 'meta' in result) {
                      meta = result.meta;
                      if (typeof result.summary === 'string') {
                        summary = result.summary;
                      }
                      if (typeof result.cleanup === 'function') {
                        cleanupFn = result.cleanup;
                      } else {
                        cleanupFn = null;
                      }
                    } else if (result && typeof result === 'object') {
                      meta = result;
                      if (typeof result.cleanup === 'function') {
                        cleanupFn = result.cleanup;
                      } else {
                        cleanupFn = null;
                      }
                    }
                  } catch (error) {
                    const message =
                      error instanceof Error && error.message ? error.message : labels.failure;
                    setStatus(message, 'error');
                    uploadComplete = false;
                    selectedFile = null;
                    selectedMeta = null;
                    selectedCleanup = null;
                    updateActionState();
                    return;
                  }
                }

                selectedFile = file;
                selectedMeta = meta && typeof meta === 'object' ? meta : null;
                selectedCleanup = cleanupFn;
                if (dialog.fileInfo) {
                  dialog.fileInfo.classList.remove('hidden');
                }
                if (dialog.fileName) {
                  dialog.fileName.textContent = file.name;
                }
                if (dialog.fileSize) {
                  const sizeText =
                    typeof file.size === 'number' && Number.isFinite(file.size)
                      ? formatBytes(file.size)
                      : '';
                  dialog.fileSize.textContent = sizeText;
                }
                if (dialog.input) {
                  dialog.input.value = '';
                }
                uploadComplete = false;
                resetProgress();
                if (summary) {
                  setStatus(summary);
                } else {
                  setStatus(labels.waiting);
                }
                updateActionState();
              } finally {
                selecting = false;
              }
            }

            async function handleDrop(event) {
              event.preventDefault();
              if (dialog.dropzone) {
                dialog.dropzone.classList.remove('active');
              }
              const files = event.dataTransfer?.files;
              if (files && files.length > 0) {
                await setSelectedFile(files[0]);
              }
            }

            async function handleInputChange(event) {
              const files = event.target?.files;
              if (files && files.length > 0) {
                await setSelectedFile(files[0]);
              }
            }

            async function handleClearSelection(event) {
              event.preventDefault();
              await setSelectedFile(null);
            }

            function openFilePicker(input) {
              if (!input) {
                return;
              }
              try {
                if (typeof input.showPicker === 'function') {
                  input.showPicker();
                  return;
                }
              } catch (error) {
                // Ignore errors from showPicker to allow fallback behaviour.
              }
              try {
                input.click();
              } catch (error) {
                // Swallow blocked click attempts quietly for keyboard activation.
              }
            }

            function handleBrowseClick(event) {
              if (!dialog.input) {
                return;
              }
              if (typeof event?.detail === 'number' && event.detail > 0) {
                return;
              }
              event?.preventDefault?.();
              event?.stopPropagation?.();
              openFilePicker(dialog.input);
            }

            function handleDropzoneKeyDown(event) {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleBrowseClick(event);
              }
            }

            function handleDragOver(event) {
              event.preventDefault();
              if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'copy';
              }
              if (dialog.dropzone) {
                dialog.dropzone.classList.add('active');
              }
            }

            function handleDragLeave(event) {
              event.preventDefault();
              if (dialog.dropzone) {
                dialog.dropzone.classList.remove('active');
              }
            }

            async function performUpload() {
              if (!uploadHandler || !selectedFile || uploading) {
                return;
              }
              uploading = true;
              uploadComplete = false;
              resetProgress();
              uploadStage = 'uploading';
              updateActionState();
              setStatus(labels.uploading);
              try {
                const result = await uploadHandler(selectedFile, {
                  reportProgress: (ratio) => {
                    if (typeof ratio === 'number') {
                      updateProgress(ratio);
                    }
                  },
                  meta: selectedMeta,
                });
                uploadResult = result ?? null;
                uploadComplete = true;
                uploading = false;
                uploadStage = 'idle';
                processingInBackground = false;
                updateProgress(1);
                setStatus(labels.success, 'success');
                updateActionState();
                if (autoCloseOnComplete) {
                  autoCloseOnComplete = false;
                  void resolveAndClose({
                    confirmed: true,
                    uploaded: true,
                    file: selectedFile,
                    result: uploadResult,
                    meta: selectedMeta,
                  });
                  return;
                }
              } catch (error) {
                uploading = false;
                uploadComplete = false;
                uploadResult = null;
                uploadStage = 'idle';
                processingInBackground = false;
                autoCloseOnComplete = false;
                const message =
                  error instanceof Error && error.message ? error.message : labels.failure;
                setStatus(message, 'error');
                resetProgress();
                updateActionState();
              }
            }

            function getFocusableElements() {
              const elements = [];
              if (dialog.dropzone instanceof HTMLElement) {
                elements.push(dialog.dropzone);
              }
              if (
                dialog.fileInfo &&
                !dialog.fileInfo.classList.contains('hidden') &&
                dialog.clear instanceof HTMLElement
              ) {
                elements.push(dialog.clear);
              }
              if (dialog.cancel instanceof HTMLElement) {
                elements.push(dialog.cancel);
              }
              if (dialog.confirm instanceof HTMLElement) {
                elements.push(dialog.confirm);
              }
              return elements.filter((element) => !element.disabled);
            }

            function handleKeyDown(event) {
              if (event.key === 'Escape') {
                event.preventDefault();
                handleCancel(event);
                return;
              }
              if (event.key === 'Tab') {
                const focusable = getFocusableElements();
                if (!focusable.length) {
                  return;
                }
                const index = focusable.indexOf(document.activeElement);
                const nextIndex = event.shiftKey
                  ? index <= 0
                    ? focusable.length - 1
                    : index - 1
                  : index === focusable.length - 1
                  ? 0
                  : index + 1;
                focusable[nextIndex].focus();
                event.preventDefault();
              }
            }

            function handleConfirm(event) {
              event.preventDefault();
              if (processingInBackground && allowBackgroundProcessing && uploading) {
                void resolveAndClose({
                  confirmed: false,
                  uploaded: uploadComplete,
                  file: selectedFile,
                  result: uploadResult,
                  meta: selectedMeta,
                  processing: true,
                });
                return;
              }
              if (uploadComplete) {
                void resolveAndClose({
                  confirmed: true,
                  uploaded: true,
                  file: selectedFile,
                  result: uploadResult,
                  meta: selectedMeta,
                });
                return;
              }
              performUpload();
            }

            function handleCancel(event) {
              event?.preventDefault?.();
              void resolveAndClose({
                confirmed: false,
                uploaded: uploadComplete,
                file: selectedFile,
                result: uploadResult,
                meta: selectedMeta,
                processing: processingInBackground && uploading,
              });
            }

            if (dialog.root) {
              dialog.root.classList.remove('hidden');
              dialog.root.classList.remove('upload-dialog-hidden');
              dialog.root.setAttribute('aria-hidden', 'false');
            }
            document.body.classList.add('dialog-open');

            if (dialog.title) {
              dialog.title.textContent = labels.title;
            }
            if (dialog.description) {
              dialog.description.textContent = labels.description;
            }
            if (dialog.prompt) {
              dialog.prompt.textContent = labels.prompt;
            }
            if (dialog.dropzone) {
              dialog.dropzone.setAttribute('aria-label', labels.prompt);
            }
            if (dialog.help) {
              dialog.help.textContent = labels.help;
            }
            if (dialog.browse) {
              dialog.browse.textContent = labels.browse;
            }
            if (dialog.clear) {
              dialog.clear.textContent = labels.clear;
            }
            if (dialog.input) {
              dialog.input.accept = accept;
              dialog.input.value = '';
            }
            if (dialog.progress) {
              dialog.progress.setAttribute('aria-label', labels.progress);
              dialog.progress.setAttribute('aria-valuenow', '0');
            }
            if (dialog.status) {
              dialog.status.classList.remove('error', 'success');
              dialog.status.textContent = '';
            }
            if (dialog.fileInfo) {
              dialog.fileInfo.classList.add('hidden');
            }
            selectedFile = null;
            selectedMeta = null;
            uploading = false;
            uploadComplete = false;
            uploadResult = null;
            resetProgress();
            setStatus(labels.waiting);
            updateActionState();

            if (dialog.confirm) {
              dialog.confirm.addEventListener('click', handleConfirm);
            }
            if (dialog.cancel) {
              dialog.cancel.textContent = t('dialog.cancel');
              dialog.cancel.addEventListener('click', handleCancel);
            }
            if (dialog.backdrop) {
              dialog.backdrop.addEventListener('click', handleCancel);
            }
            if (dialog.window) {
              dialog.window.addEventListener('keydown', handleKeyDown);
            }
            if (dialog.dropzone) {
              dialog.dropzone.addEventListener('click', handleBrowseClick);
              dialog.dropzone.addEventListener('keydown', handleDropzoneKeyDown);
              dialog.dropzone.addEventListener('dragover', handleDragOver);
              dialog.dropzone.addEventListener('dragleave', handleDragLeave);
              dialog.dropzone.addEventListener('drop', handleDrop);
            }
            if (dialog.browse) {
              dialog.browse.addEventListener('click', handleBrowseClick);
              dialog.browse.addEventListener('keydown', handleDropzoneKeyDown);
            }
            if (dialog.input) {
              dialog.input.addEventListener('change', handleInputChange);
            }
            if (dialog.clear) {
              dialog.clear.addEventListener('click', handleClearSelection);
            }

            window.requestAnimationFrame(() => {
              const target = dialog.dropzone instanceof HTMLElement ? dialog.dropzone : dialog.confirm;
              target?.focus?.({ preventScroll: true });
            });
          });
        }

        async function showSlideRangeDialog(source) {
          return new Promise((resolve) => {
            const dialog = dom.slideRangeDialog;
            if (!dialog || !dialog.root || dialogState.active || dialogState.uploadActive) {
              resolve({ confirmed: false, pageStart: null, pageEnd: null, pageTotal: null });
              return;
            }

            hidePendingOverlay();
            dialogState.active = true;
            let cancelled = false;
            let pageCount = 0;
            let startPage = 1;
            let endPage = 1;
            let anchorPage = 1;
            let previewFailed = false;
            let manualSelectionMade = false;
            const pageEntries = [];
            const BASE_PREVIEW_COLUMN_WIDTH = 220;
            let previewZoom = 100;
            let fallbackObjectUrl = null;
            let fallbackPreviewUrl = null;
            const previewSource =
              source instanceof Blob
                ? { file: source }
                : source && typeof source === 'object'
                ? { ...source }
                : null;

            const previousActive =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;

            function clampPage(value) {
              const numeric =
                typeof value === 'number'
                  ? value
                  : Number.parseInt(String(value ?? ''), 10);
              if (!Number.isFinite(numeric)) {
                return 1;
              }
              const rounded = Math.max(1, Math.round(numeric));
              if (!pageCount || pageCount < 1) {
                return rounded;
              }
              return Math.min(pageCount, rounded);
            }

            function configureInputBounds(totalPages) {
              const numeric =
                typeof totalPages === 'number' && Number.isFinite(totalPages) && totalPages > 0
                  ? Math.round(totalPages)
                  : 0;
              if (dialog.startInput) {
                dialog.startInput.min = '1';
                dialog.startInput.max = numeric > 0 ? String(numeric) : '';
              }
              if (dialog.endInput) {
                dialog.endInput.min = '1';
                dialog.endInput.max = numeric > 0 ? String(numeric) : '';
              }
            }

            function resolvePreviewIdentifiers() {
              if (!previewSource || typeof previewSource !== 'object') {
                return { lectureId: null, previewId: null };
              }

              let previewId =
                typeof previewSource.previewId === 'string' && previewSource.previewId
                  ? previewSource.previewId
                  : null;
              let lectureId = null;
              if (
                typeof previewSource.lectureId === 'number' ||
                (typeof previewSource.lectureId === 'string' && previewSource.lectureId)
              ) {
                lectureId = String(previewSource.lectureId).trim() || null;
              }

              if ((!previewId || !lectureId) && typeof previewSource.url === 'string') {
                const match = previewSource.url.match(
                  /\/api\/lectures\/(\d+)\/slides\/previews\/([^/?#]+)/,
                );
                if (match) {
                  if (!lectureId) {
                    lectureId = match[1];
                  }
                  if (!previewId) {
                    try {
                      previewId = decodeURIComponent(match[2]);
                    } catch (decodeError) {
                      previewId = match[2];
                    }
                  }
                }
              }

              return { lectureId, previewId };
            }

            function updateFallbackVisibility() {
              const hasUrl = Boolean(fallbackPreviewUrl);
              if (dialog.fallbackFrame) {
                dialog.fallbackFrame.src = hasUrl ? fallbackPreviewUrl : 'about:blank';
                dialog.fallbackFrame.classList.toggle('hidden', !hasUrl);
              }
              if (dialog.fallbackLink) {
                if (hasUrl) {
                  dialog.fallbackLink.href = fallbackPreviewUrl;
                  dialog.fallbackLink.classList.remove('hidden');
                } else {
                  dialog.fallbackLink.href = '#';
                  dialog.fallbackLink.classList.add('hidden');
                }
              }
              if (dialog.fallback) {
                dialog.fallback.classList.toggle('hidden', !previewFailed);
              }
            }

            function assignFallbackPreview(value, { isObjectUrl = false } = {}) {
              const nextValue = value || null;
              if (
                fallbackObjectUrl &&
                fallbackObjectUrl !== nextValue &&
                typeof URL !== 'undefined' &&
                typeof URL.revokeObjectURL === 'function'
              ) {
                try {
                  URL.revokeObjectURL(fallbackObjectUrl);
                } catch (error) {
                  // Ignore revocation failures.
                }
              }
              fallbackObjectUrl = isObjectUrl && nextValue ? nextValue : null;
              fallbackPreviewUrl = nextValue;
              updateFallbackVisibility();
            }

            function clearFallbackPreview() {
              if (
                fallbackObjectUrl &&
                typeof URL !== 'undefined' &&
                typeof URL.revokeObjectURL === 'function'
              ) {
                try {
                  URL.revokeObjectURL(fallbackObjectUrl);
                } catch (error) {
                  // Ignore revocation failures.
                }
              }
              fallbackObjectUrl = null;
              fallbackPreviewUrl = null;
              updateFallbackVisibility();
            }

            function resolveFallbackPreview() {
              const canCreateObjectUrl =
                typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
              if (canCreateObjectUrl && previewSource?.file instanceof Blob) {
                const url = URL.createObjectURL(previewSource.file);
                return { url, isObjectUrl: true };
              }
              if (canCreateObjectUrl && source instanceof Blob) {
                const url = URL.createObjectURL(source);
                return { url, isObjectUrl: true };
              }
              if (previewSource && typeof previewSource.url === 'string' && previewSource.url) {
                return { url: resolveAppUrl(previewSource.url), isObjectUrl: false };
              }
              const { lectureId, previewId } = resolvePreviewIdentifiers();
              if (lectureId && previewId) {
                const directUrl = `/api/lectures/${lectureId}/slides/previews/${encodeURIComponent(
                  previewId,
                )}`;
                return { url: resolveAppUrl(directUrl), isObjectUrl: false };
              }
              return { url: null, isObjectUrl: false };
            }

            async function derivePdfPageCount(fallbackPreview) {
              const blobCandidates = [];
              if (previewSource?.file instanceof Blob) {
                blobCandidates.push(previewSource.file);
              }
              if (source instanceof Blob && source !== previewSource?.file) {
                blobCandidates.push(source);
              }

              for (const blobCandidate of blobCandidates) {
                try {
                  const blobCount = await extractPdfPageCountFromBlob(blobCandidate);
                  if (Number.isFinite(blobCount) && blobCount > 0) {
                    return Math.round(blobCount);
                  }
                } catch (blobError) {
                  console.warn('Failed to derive PDF page count from blob', blobError);
                }
              }

              const urlCandidates = new Set();
              if (previewSource && typeof previewSource.url === 'string' && previewSource.url) {
                urlCandidates.add(resolveAppUrl(previewSource.url));
              }
              if (fallbackPreview?.url) {
                urlCandidates.add(fallbackPreview.url);
              }

              const withCredentials = previewSource?.withCredentials === false ? false : true;
              for (const candidateUrl of urlCandidates) {
                try {
                  const urlCount = await extractPdfPageCountFromUrl(candidateUrl, {
                    withCredentials,
                  });
                  if (Number.isFinite(urlCount) && urlCount > 0) {
                    return Math.round(urlCount);
                  }
                } catch (urlError) {
                  console.warn('Failed to derive PDF page count from URL', urlError);
                }
              }

              return null;
            }

            async function fetchPreviewPageCount() {
              const { lectureId, previewId } = resolvePreviewIdentifiers();
              if (!lectureId || !previewId) {
                return null;
              }

              const credentials =
                previewSource && previewSource.withCredentials === false ? 'omit' : 'include';

              try {
                const payload = await request(
                  `/api/lectures/${lectureId}/slides/previews/${encodeURIComponent(previewId)}/metadata`,
                  {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    credentials,
                    cache: 'no-store',
                  },
                );
                const value = payload?.page_count ?? payload?.pageCount;
                const numeric = Number(value);
                if (Number.isFinite(numeric) && numeric > 0) {
                  return Math.round(numeric);
                }
              } catch (error) {
                console.warn('Failed to load slide metadata', error);
              }

              return null;
            }

            function resolvePreviewImageUrl(pageNumber) {
              const { lectureId, previewId } = resolvePreviewIdentifiers();
              if (!lectureId || !previewId || !pageNumber) {
                return null;
              }
              const encoded = encodeURIComponent(previewId);
              const url = `/api/lectures/${lectureId}/slides/previews/${encoded}/pages/${pageNumber}`;
              return resolveAppUrl(url);
            }

            async function renderServerPreviewPages(totalPages) {
              if (!dialog.pages) {
                return;
              }
              dialog.pages.innerHTML = '';
              pageEntries.length = 0;
              const count = Number.isFinite(totalPages) ? Number(totalPages) : 0;
              if (count < 1) {
                return;
              }
              for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
                if (cancelled) {
                  return;
                }
                const wrapper = document.createElement('div');
                wrapper.className = 'slide-preview-page';
                wrapper.dataset.pageNumber = String(pageNumber);
                wrapper.tabIndex = 0;
                const label = document.createElement('div');
                label.className = 'slide-preview-page-label';
                label.textContent = t('dialogs.slideRange.pageLabel', { page: pageNumber });
                const image = document.createElement('img');
                image.loading = 'lazy';
                image.decoding = 'async';
                image.alt = t('dialogs.slideRange.pageLabel', { page: pageNumber });
                const imageUrl = resolvePreviewImageUrl(pageNumber);
                if (imageUrl) {
                  image.src = imageUrl;
                }
                wrapper.appendChild(label);
                wrapper.appendChild(image);
                dialog.pages.appendChild(wrapper);
                pageEntries.push({ element: wrapper, label, pageNumber });
                wrapper.addEventListener('click', (event) => {
                  handlePageSelection(pageNumber, event.shiftKey);
                });
                wrapper.addEventListener('keydown', (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handlePageSelection(pageNumber, event.shiftKey);
                  }
                });
              }
            }

            async function enableServerRenderedPreview({ knownPageCount = null } = {}) {
              if (cancelled) {
                return;
              }

              const countCandidates = [
                knownPageCount,
                previewSource && typeof previewSource.pageCount !== 'undefined'
                  ? previewSource.pageCount
                  : null,
              ];

              let resolvedCount = null;
              for (const candidate of countCandidates) {
                const numeric = Number(candidate);
                if (Number.isFinite(numeric) && numeric > 0) {
                  resolvedCount = Math.round(numeric);
                  break;
                }
              }

              const fallbackPreview = resolveFallbackPreview();

              if (!resolvedCount || resolvedCount <= 0) {
                try {
                  resolvedCount = await fetchPreviewPageCount();
                } catch (metadataError) {
                  resolvedCount = null;
                }
              }

              if (!resolvedCount || resolvedCount <= 0) {
                try {
                  const derivedCount = await derivePdfPageCount(fallbackPreview);
                  if (Number.isFinite(derivedCount) && derivedCount > 0) {
                    resolvedCount = Math.round(derivedCount);
                  }
                } catch (pageCountError) {
                  console.warn('Unable to determine PDF page count from PDF data', pageCountError);
                }
              }

              pageCount = Number.isFinite(resolvedCount) && resolvedCount > 0 ? Math.round(resolvedCount) : 0;
              configureInputBounds(pageCount);
              startPage = 1;
              endPage = pageCount > 0 ? pageCount : 1;
              anchorPage = 1;
              manualSelectionMade = false;

              assignFallbackPreview(fallbackPreview.url, {
                isObjectUrl: fallbackPreview.isObjectUrl,
              });

              if (dialog.loading) {
                dialog.loading.classList.add('hidden');
              }

              let renderSucceeded = false;
              if (!cancelled && pageCount > 0) {
                try {
                  await renderServerPreviewPages(pageCount);
                  renderSucceeded = true;
                } catch (error) {
                  if (!cancelled) {
                    console.warn('Unable to render slide previews', error);
                  }
                }
              }

              previewFailed = !renderSucceeded;

              if (dialog.error) {
                if (previewFailed) {
                  dialog.error.textContent = t('dialogs.slideRange.error');
                  dialog.error.classList.remove('hidden');
                } else {
                  dialog.error.textContent = '';
                  dialog.error.classList.add('hidden');
                }
              }

              updateFallbackVisibility();
              enableControls();
              updateRangeSummary();
              updateTexts();

              window.requestAnimationFrame(() => {
                if (dialog.startInput && !dialog.startInput.disabled) {
                  dialog.startInput.focus({ preventScroll: true });
                  dialog.startInput.select();
                } else if (dialog.confirm) {
                  dialog.confirm.focus({ preventScroll: true });
                }
              });
            }

            function clampZoom(value) {
              const numeric =
                typeof value === 'number'
                  ? value
                  : Number.parseInt(String(value ?? ''), 10);
              if (!Number.isFinite(numeric)) {
                return 100;
              }
              return Math.min(200, Math.max(50, Math.round(numeric)));
            }

            function updateZoomDisplay() {
              if (dialog.pages) {
                const scale = clampZoom(previewZoom) / 100;
                const minWidth = Math.round(BASE_PREVIEW_COLUMN_WIDTH * scale);
                dialog.pages.style.setProperty(
                  '--slide-preview-min-width',
                  `${minWidth}px`,
                );
              }
              const zoomText = t('dialogs.slideRange.zoomValue', {
                value: clampZoom(previewZoom),
              });
              if (dialog.zoomValue) {
                dialog.zoomValue.textContent = zoomText;
              }
              if (dialog.zoomSlider) {
                dialog.zoomSlider.setAttribute('aria-valuetext', zoomText);
              }
            }

            function handleZoomInput(event) {
              previewZoom = clampZoom(event?.target?.value);
              if (dialog.zoomSlider) {
                dialog.zoomSlider.value = String(previewZoom);
              }
              updateZoomDisplay();
            }

            function updateTexts() {
              if (dialog.title) {
                dialog.title.textContent = t('dialogs.slideRange.title');
              }
              if (dialog.description) {
                dialog.description.textContent = t('dialogs.slideRange.description');
              }
              if (dialog.startLabel) {
                dialog.startLabel.textContent = t('dialogs.slideRange.startLabel');
              }
              if (dialog.endLabel) {
                dialog.endLabel.textContent = t('dialogs.slideRange.endLabel');
              }
              if (dialog.zoomLabel) {
                dialog.zoomLabel.textContent = t('dialogs.slideRange.zoomLabel');
              }
              if (dialog.fallbackMessage) {
                dialog.fallbackMessage.textContent = t('dialogs.slideRange.fallbackMessage');
              }
              if (dialog.fallbackLink) {
                dialog.fallbackLink.textContent = t('dialogs.slideRange.fallbackLink');
              }
              if (dialog.fallbackFrame) {
                dialog.fallbackFrame.setAttribute(
                  'title',
                  t('dialogs.slideRange.fallbackFrameTitle'),
                );
              }
              if (dialog.selectAll) {
                dialog.selectAll.textContent = t('dialogs.slideRange.selectAll');
              }
              if (dialog.hint) {
                dialog.hint.textContent = t('dialogs.slideRange.rangeHint');
              }
              if (dialog.loading) {
                dialog.loading.textContent = t('dialogs.slideRange.loading');
              }
              if (dialog.confirm) {
                dialog.confirm.textContent = t('dialogs.slideRange.confirm');
              }
              if (dialog.cancel) {
                dialog.cancel.textContent = t('dialog.cancel');
              }
              if (previewFailed && dialog.error) {
                dialog.error.textContent = t('dialogs.slideRange.error');
              }
              updateZoomDisplay();
              pageEntries.forEach(({ label, pageNumber }) => {
                if (label) {
                  label.textContent = t('dialogs.slideRange.pageLabel', {
                    page: pageNumber,
                  });
                }
              });
            }

            function updateRangeSummary() {
              const lower = clampPage(startPage);
              const upper = clampPage(endPage);
              startPage = Math.min(lower, upper);
              endPage = Math.max(lower, upper);
              anchorPage = startPage;

              if (dialog.startInput) {
                dialog.startInput.value = String(startPage);
              }
              if (dialog.endInput) {
                dialog.endInput.value = String(endPage);
              }

              if (!pageCount || pageCount < 1) {
                if (dialog.summary) {
                  if (!manualSelectionMade) {
                    dialog.summary.textContent = t('dialogs.slideRange.allPages');
                  } else {
                    const key =
                      startPage === endPage
                        ? 'dialogs.slideRange.summarySingleUnknown'
                        : 'dialogs.slideRange.summaryUnknown';
                    dialog.summary.textContent = t(key, {
                      start: startPage,
                      end: endPage,
                    });
                  }
                }
                pageEntries.forEach(({ element }) => {
                  element.classList.add('selected');
                });
                return;
              }

              if (dialog.summary) {
                const key =
                  startPage === endPage
                    ? 'dialogs.slideRange.summarySingle'
                    : 'dialogs.slideRange.summary';
                dialog.summary.textContent = t(key, {
                  start: startPage,
                  end: endPage,
                  total: pageCount,
                });
              }

              pageEntries.forEach(({ element, pageNumber }) => {
                const selected = pageNumber >= startPage && pageNumber <= endPage;
                element.classList.toggle('selected', selected);
              });
            }

            function disableControls() {
              if (dialog.startInput) {
                dialog.startInput.disabled = true;
              }
              if (dialog.endInput) {
                dialog.endInput.disabled = true;
              }
              if (dialog.selectAll) {
                dialog.selectAll.disabled = true;
              }
              if (dialog.confirm) {
                dialog.confirm.disabled = true;
              }
              if (dialog.zoomSlider) {
                dialog.zoomSlider.disabled = true;
              }
            }

            function enableControls() {
              const hasPageCount = Boolean(pageCount && pageCount > 0);
              const manualOnly = previewFailed && !hasPageCount;
              if (dialog.startInput) {
                dialog.startInput.disabled = !manualOnly && !hasPageCount;
              }
              if (dialog.endInput) {
                dialog.endInput.disabled = !manualOnly && !hasPageCount;
              }
              if (dialog.selectAll) {
                const canSelectAll = hasPageCount || manualOnly;
                dialog.selectAll.disabled = !canSelectAll;
              }
              if (dialog.confirm) {
                dialog.confirm.disabled = false;
              }
              if (dialog.zoomSlider) {
                dialog.zoomSlider.disabled = !hasPageCount || previewFailed;
              }
            }

            function enableConfirmOnly() {
              if (dialog.confirm) {
                dialog.confirm.disabled = false;
              }
              if (dialog.selectAll) {
                dialog.selectAll.disabled = true;
              }
              if (dialog.zoomSlider) {
                dialog.zoomSlider.disabled = true;
              }
            }

            function cleanup() {
              cancelled = true;
              activeSlideRangeDialog = null;
              previewFailed = false;
              clearFallbackPreview();
              if (dialog.confirm) {
                dialog.confirm.removeEventListener('click', handleConfirm);
              }
              if (dialog.cancel) {
                dialog.cancel.removeEventListener('click', handleCancel);
              }
              if (dialog.backdrop) {
                dialog.backdrop.removeEventListener('click', handleCancel);
              }
              if (dialog.window) {
                dialog.window.removeEventListener('keydown', handleKeyDown);
              }
              if (dialog.startInput) {
                dialog.startInput.removeEventListener('input', handleStartInput);
                dialog.startInput.removeEventListener('blur', handleStartBlur);
              }
              if (dialog.endInput) {
                dialog.endInput.removeEventListener('input', handleEndInput);
                dialog.endInput.removeEventListener('blur', handleEndBlur);
              }
              if (dialog.selectAll) {
                dialog.selectAll.removeEventListener('click', handleSelectAll);
              }
              if (dialog.zoomSlider) {
                dialog.zoomSlider.removeEventListener('input', handleZoomInput);
              }
              if (dialog.root) {
                dialog.root.classList.add('hidden');
                dialog.root.setAttribute('aria-hidden', 'true');
              }
              if (dialog.preview) {
                dialog.preview.scrollTop = 0;
              }
              if (dialog.pages) {
                dialog.pages.innerHTML = '';
              }
              if (dialog.error) {
                dialog.error.classList.add('hidden');
                dialog.error.textContent = '';
              }
              if (dialog.loading) {
                dialog.loading.classList.remove('hidden');
              }
              if (dialog.summary) {
                dialog.summary.textContent = '';
              }
              if (dialog.zoomSlider) {
                dialog.zoomSlider.disabled = false;
                dialog.zoomSlider.value = '100';
              }
              previewZoom = 100;
              if (dialog.pages) {
                dialog.pages.style.removeProperty('--slide-preview-min-width');
              }
              if (dialog.zoomValue) {
                dialog.zoomValue.textContent = '';
              }
              document.body.classList.remove('dialog-open');
              dialogState.active = false;
              if (previousActive) {
                previousActive.focus({ preventScroll: true });
              }
            }

            function resolveAndClose(result) {
              cleanup();
              resolve(result);
            }

            function handleConfirm(event) {
              event.preventDefault();
              if (dialog.confirm && dialog.confirm.disabled) {
                return;
              }
              if (previewFailed && (!pageCount || pageCount < 1) && !manualSelectionMade) {
                resolveAndClose({
                  confirmed: true,
                  pageStart: null,
                  pageEnd: null,
                  pageTotal: null,
                });
                return;
              }
              startPage = clampPage(dialog.startInput?.value ?? startPage);
              anchorPage = startPage;
              endPage = clampPage(dialog.endInput?.value ?? endPage);
              manualSelectionMade = manualSelectionMade || previewFailed;
              updateRangeSummary();
              resolveAndClose({
                confirmed: true,
                pageStart: startPage,
                pageEnd: endPage,
                pageTotal: pageCount > 0 ? pageCount : null,
              });
            }

            function handleCancel(event) {
              event?.preventDefault?.();
              resolveAndClose({
                confirmed: false,
                pageStart: null,
                pageEnd: null,
                pageTotal: pageCount > 0 ? pageCount : null,
              });
            }

            function getFocusableElements() {
              return [
                dialog.startInput,
                dialog.endInput,
                dialog.selectAll,
                dialog.confirm,
                dialog.cancel,
              ].filter((element) => element instanceof HTMLElement && !element.disabled);
            }

            function handleKeyDown(event) {
              if (event.key === 'Escape') {
                event.preventDefault();
                handleCancel(event);
                return;
              }
              if (event.key === 'Tab') {
                const focusable = getFocusableElements();
                if (!focusable.length) {
                  return;
                }
                const currentIndex = focusable.indexOf(document.activeElement);
                const nextIndex = event.shiftKey
                  ? currentIndex <= 0
                    ? focusable.length - 1
                    : currentIndex - 1
                  : currentIndex === focusable.length - 1
                    ? 0
                    : currentIndex + 1;
                focusable[nextIndex].focus({ preventScroll: true });
                event.preventDefault();
              }
            }

            function handleStartInput(event) {
              if (!pageCount && !previewFailed) {
                return;
              }
              const newValue = clampPage(event.target.value);
              if (!Number.isFinite(newValue)) {
                return;
              }
              startPage = newValue;
              anchorPage = startPage;
              manualSelectionMade = true;
              updateRangeSummary();
            }

            function handleStartBlur() {
              if (!pageCount && !previewFailed) {
                return;
              }
              startPage = clampPage(dialog.startInput?.value);
              anchorPage = startPage;
              manualSelectionMade = manualSelectionMade || previewFailed;
              updateRangeSummary();
            }

            function handleEndInput(event) {
              if (!pageCount && !previewFailed) {
                return;
              }
              const newValue = clampPage(event.target.value);
              if (!Number.isFinite(newValue)) {
                return;
              }
              endPage = newValue;
              manualSelectionMade = true;
              updateRangeSummary();
            }

            function handleEndBlur() {
              if (!pageCount && !previewFailed) {
                return;
              }
              endPage = clampPage(dialog.endInput?.value);
              manualSelectionMade = manualSelectionMade || previewFailed;
              updateRangeSummary();
            }

            function handleSelectAll(event) {
              event?.preventDefault?.();
              if (!pageCount && !previewFailed) {
                return;
              }
              startPage = 1;
              endPage = pageCount && pageCount > 0 ? pageCount : Math.max(1, endPage);
              anchorPage = startPage;
              manualSelectionMade = false;
              updateRangeSummary();
            }

            function handlePageSelection(pageNumber, extend) {
              if (!pageCount) {
                return;
              }
              const clamped = clampPage(pageNumber);
              if (extend) {
                const lower = Math.min(anchorPage, clamped);
                const upper = Math.max(anchorPage, clamped);
                startPage = lower;
                endPage = upper;
              } else {
                startPage = clamped;
                endPage = clamped;
                anchorPage = clamped;
              }
              manualSelectionMade = true;
              updateRangeSummary();
            }

            activeSlideRangeDialog = {
              updateTexts,
              updateRangeSummary,
            };

            if (dialog.pages) {
              dialog.pages.innerHTML = '';
            }
            if (dialog.summary) {
              dialog.summary.textContent = '';
            }
            if (dialog.error) {
              dialog.error.classList.add('hidden');
              dialog.error.textContent = '';
            }
            if (dialog.loading) {
              dialog.loading.classList.remove('hidden');
            }
            if (dialog.startInput) {
              dialog.startInput.value = '1';
            }
            if (dialog.endInput) {
              dialog.endInput.value = '1';
            }
            configureInputBounds(0);
            manualSelectionMade = false;

            disableControls();
            updateTexts();
            updateRangeSummary();

            if (dialog.root) {
              dialog.root.classList.remove('hidden');
              dialog.root.setAttribute('aria-hidden', 'false');
            }
            document.body.classList.add('dialog-open');
            if (dialog.preview) {
              dialog.preview.scrollTop = 0;
            }

            if (dialog.confirm) {
              dialog.confirm.addEventListener('click', handleConfirm);
            }
            if (dialog.cancel) {
              dialog.cancel.addEventListener('click', handleCancel);
            }
            if (dialog.backdrop) {
              dialog.backdrop.addEventListener('click', handleCancel);
            }
            if (dialog.window) {
              dialog.window.addEventListener('keydown', handleKeyDown);
            }
            if (dialog.startInput) {
              dialog.startInput.addEventListener('input', handleStartInput);
              dialog.startInput.addEventListener('blur', handleStartBlur);
            }
            if (dialog.endInput) {
              dialog.endInput.addEventListener('input', handleEndInput);
              dialog.endInput.addEventListener('blur', handleEndBlur);
            }
            if (dialog.selectAll) {
              dialog.selectAll.addEventListener('click', handleSelectAll);
            }
            if (dialog.zoomSlider) {
              previewZoom = clampZoom(dialog.zoomSlider.value);
              dialog.zoomSlider.addEventListener('input', handleZoomInput);
            }

            window.requestAnimationFrame(() => {
              if (dialog.startInput && !dialog.startInput.disabled) {
                dialog.startInput.focus({ preventScroll: true });
                dialog.startInput.select();
              } else if (dialog.cancel) {
                dialog.cancel.focus({ preventScroll: true });
              } else if (dialog.confirm && !dialog.confirm.disabled) {
                dialog.confirm.focus({ preventScroll: true });
              }
            });

            (async () => {
              try {
                await enableServerRenderedPreview();
              } catch (error) {
                if (cancelled) {
                  return;
                }
                console.warn('Slide preview failed, enabling manual page selection', error);
                enableControls();
              }
            })();
          });
        }

        function formatNumber(value) {
          return new Intl.NumberFormat().format(value ?? 0);
        }

        function formatBytes(bytes) {
          if (typeof bytes !== 'number' || Number.isNaN(bytes)) {
            return '';
          }
          if (bytes < 1024) {
            return `${bytes} B`;
          }
          const units = ['KB', 'MB', 'GB', 'TB'];
          let value = bytes / 1024;
          let unitIndex = 0;
          while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex += 1;
          }
          return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
        }

        function formatDate(isoString) {
          if (!isoString) {
            return '';
          }
          const formatter = new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          });
          return formatter.format(new Date(isoString));
        }

        function buildStorageURL(path) {
          if (!path) {
            return '#';
          }
          const encodedPath = path
            .split('/')
            .map((segment) => encodeURIComponent(segment))
            .join('/');
          return resolveAppUrl(`/storage/${encodedPath}`);
        }

        function buildStorageListUrl(path) {
          if (!path) {
            return '/api/storage/list';
          }
          const params = new URLSearchParams();
          params.set('path', path);
          return `/api/storage/list?${params.toString()}`;
        }

        async function uploadWithProgress(url, options = {}) {
          const resolvedUrl = resolveAppUrl(url);
          const method = typeof options.method === 'string' ? options.method.toUpperCase() : 'POST';
          const headers = options.headers && typeof options.headers === 'object' ? options.headers : {};
          const body = options.body ?? null;
          const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

          return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(method, resolvedUrl);
            xhr.responseType = 'json';

            Object.entries(headers).forEach(([key, value]) => {
              if (typeof key === 'string' && typeof value === 'string') {
                xhr.setRequestHeader(key, value);
              }
            });

            xhr.upload.addEventListener('progress', (event) => {
              if (!onProgress) {
                return;
              }
              if (event.lengthComputable && event.total > 0) {
                onProgress(event.loaded / event.total);
              }
            });

            xhr.addEventListener('load', () => {
              if (onProgress) {
                onProgress(1);
              }
              if (xhr.status >= 200 && xhr.status < 300) {
                const responseBody = xhr.response ?? null;
                resolve(responseBody);
                return;
              }
              let detail = `${xhr.status} ${xhr.statusText || ''}`.trim();
              const responseBody = xhr.response ?? null;
              if (responseBody && typeof responseBody === 'object' && responseBody.detail) {
                detail = responseBody.detail;
              } else if (!responseBody && xhr.responseText) {
                try {
                  const parsed = JSON.parse(xhr.responseText);
                  if (parsed && parsed.detail) {
                    detail = parsed.detail;
                  }
                } catch (error) {
                  // Ignore parse errors.
                }
              }
              if (!detail) {
                detail = 'Upload failed.';
              }
              reject(new Error(detail));
            });

            xhr.addEventListener('error', () => {
              reject(new Error('Network error during upload.'));
            });

            xhr.addEventListener('abort', () => {
              reject(new Error('Upload was aborted.'));
            });

            try {
              xhr.send(body);
            } catch (error) {
              reject(error instanceof Error ? error : new Error('Unable to start upload.'));
            }
          });
        }

        async function request(url, options = {}) {
          const resolvedUrl = resolveAppUrl(url);
          const response = await fetch(resolvedUrl, options);
          if (!response.ok) {
            let detail = `${response.status} ${response.statusText}`;
            try {
              const payload = await response.json();
              if (payload && payload.detail) {
                detail = payload.detail;
              }
            } catch (error) {
              // Ignore JSON parsing errors.
            }
            throw new Error(detail);
          }
          if (response.status === 204) {
            return null;
          }
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            return await response.json();
          }
          return null;
        }

        async function createSlidePreview(lectureId, file, options = {}) {
          if (!lectureId) {
            return null;
          }
          const formData = new FormData();
          const source =
            typeof options.source === 'string' && options.source
              ? options.source.trim().toLowerCase()
              : 'upload';
          if (source === 'existing') {
            formData.append('source', 'existing');
          } else {
            if (!(file instanceof Blob)) {
              return null;
            }
            formData.append('file', file);
          }
          const payload = await request(
            `/api/lectures/${lectureId}/slides/previews`,
            { method: 'POST', body: formData },
          );
          if (!payload || !payload.preview_id || !payload.preview_url) {
            return null;
          }
          const providedName =
            (typeof payload.filename === 'string' && payload.filename) ||
            (file && typeof file.name === 'string' && file.name) ||
            'slides.pdf';
          return {
            id: payload.preview_id,
            url: resolveAppUrl(payload.preview_url),
            filename: providedName,
            pageCount:
              typeof payload.page_count === 'number' && Number.isFinite(payload.page_count)
                ? Math.max(0, Math.round(payload.page_count))
                : null,
          };
        }

        async function deleteSlidePreview(lectureId, previewId) {
          if (!lectureId || !previewId) {
            return;
          }
          try {
            await request(
              `/api/lectures/${lectureId}/slides/previews/${encodeURIComponent(previewId)}`,
              { method: 'DELETE' },
            );
          } catch (error) {
            console.warn('Failed to remove slide preview', error);
          }
        }

        async function loadGpuWhisperStatus() {
          try {
            const payload = await request('/api/settings/whisper-gpu/status');
            const status = payload?.status || {};
            updateGpuWhisperUI(status);
          } catch (error) {
            updateGpuWhisperUI({
              supported: false,
              checked: true,
              message: error instanceof Error ? error.message : String(error),
              unavailable: false,
            });
          }
        }

        async function fetchTranscriptionProgress(lectureId) {
          if (!lectureId) {
            return null;
          }
          try {
            const payload = await request(
              `/api/lectures/${lectureId}/transcription-progress`,
            );
            return payload?.progress || null;
          } catch (error) {
            return null;
          }
        }

        async function fetchProcessingProgress(lectureId) {
          if (!lectureId) {
            return null;
          }
          try {
            const payload = await request(
              `/api/lectures/${lectureId}/processing-progress`,
            );
            return payload?.progress || null;
          } catch (error) {
            return null;
          }
        }

        function stopTranscriptionProgress({ preserveMessage = false } = {}) {
          if (state.transcriptionProgressTimer !== null) {
            window.clearInterval(state.transcriptionProgressTimer);
          }
          state.transcriptionProgressTimer = null;
          state.transcriptionProgressLectureId = null;
          if (!preserveMessage) {
            state.lastProgressMessage = '';
            state.lastProgressRatio = null;
            resetStatusProgress();
          }
        }

        function stopProcessingProgress({ preserveMessage = false } = {}) {
          if (state.processingProgressTimer !== null) {
            window.clearInterval(state.processingProgressTimer);
          }
          state.processingProgressTimer = null;
          state.processingProgressLectureId = null;
          if (!preserveMessage) {
            state.lastProgressMessage = '';
            state.lastProgressRatio = null;
            resetStatusProgress();
          }
        }

        async function handleProgressUpdate(progress, context = {}) {
          if (!progress) {
            return;
          }
          const source = context?.source || 'transcription';
          const lectureId = context?.lectureId || null;
          const message = progress.message || '';
          const variant = progress.error ? 'error' : 'info';
          const finished = Boolean(progress.finished);
          const ratio =
            typeof progress.ratio === 'number' && Number.isFinite(progress.ratio)
              ? Math.max(0, Math.min(progress.ratio, 1))
              : null;
          const shouldUpdate =
            message !== state.lastProgressMessage || ratio !== state.lastProgressRatio;
          if (shouldUpdate) {
            const displayMessage = message || state.lastProgressMessage || t('status.processing');
            showStatus(displayMessage, variant, {
              progressRatio: ratio,
              persist: !finished,
            });
            state.lastProgressMessage = message;
            state.lastProgressRatio = ratio;
          }
          if (finished) {
            if (source === 'processing') {
              stopProcessingProgress({ preserveMessage: true });
              if (lectureId) {
                try {
                  await refreshData();
                  if (state.selectedLectureId === lectureId) {
                    await selectLecture(lectureId);
                  }
                } catch (error) {
                  const detail =
                    error instanceof Error && error.message
                      ? error.message
                      : t('status.storageLoadFailed');
                  showStatus(detail, 'error');
                }
              }
            } else {
              stopTranscriptionProgress({ preserveMessage: true });
            }
          }
          await refreshProgressQueue({ silent: true });
        }

        function startTranscriptionProgress(lectureId) {
          stopTranscriptionProgress();
          if (!lectureId) {
            return;
          }
          state.transcriptionProgressLectureId = lectureId;
          let polling = false;
          const poll = async () => {
            if (polling) {
              return;
            }
            polling = true;
            try {
              const progress = await fetchTranscriptionProgress(lectureId);
              if (progress) {
                await handleProgressUpdate(progress, { source: 'transcription', lectureId });
              }
            } finally {
              polling = false;
            }
          };
          void poll();
          state.transcriptionProgressTimer = window.setInterval(() => {
            void poll();
          }, 1200);
        }

        function startProcessingProgress(lectureId) {
          stopProcessingProgress();
          if (!lectureId) {
            return;
          }
          state.processingProgressLectureId = lectureId;
          let polling = false;
          const poll = async () => {
            if (polling) {
              return;
            }
            polling = true;
            try {
              const progress = await fetchProcessingProgress(lectureId);
              if (progress) {
                await handleProgressUpdate(progress, { source: 'processing', lectureId });
              }
            } finally {
              polling = false;
            }
          };
          void poll();
          state.processingProgressTimer = window.setInterval(() => {
            void poll();
          }, 900);
        }

        function clearDetailPanel() {
          dom.summary.textContent = t('details.summaryPlaceholder');
          dom.summary.classList.add('placeholder');
          if (dom.editForm) {
            dom.editForm.reset();
          }
          dom.assetSection.hidden = true;
          dom.assetList.innerHTML = '';
          setTranscribeControls(null, null, null);
          setTranscribeButtonDisabled(true);
          state.selectedLectureDetail = null;
          updateEditControlsAvailability();
        }

        function updateEditControlsAvailability() {
          const hasSelection = Boolean(state.selectedLectureId);
          const allowEditing = state.editMode && hasSelection;
          dom.editForm.hidden = !allowEditing;
          dom.deleteButton.hidden = !allowEditing;
        }

        function updateEditModeUI() {
          const isActive = state.editMode;
          if (dom.editToggle) {
            dom.editToggle.textContent = isActive
              ? t('topBar.exitEdit')
              : t('topBar.enableEdit');
            dom.editToggle.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            dom.editToggle.classList.toggle('active', isActive);
          }
          if (dom.editBanner) {
            dom.editBanner.hidden = !isActive;
          }
          renderCurriculum();
          updateEditControlsAvailability();
        }

        function setActiveView(view) {
          if (!dom.views[view]) {
            return;
          }
          state.activeView = view;
          dom.viewButtons.forEach((button) => {
            const isActive = button.dataset.view === view;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          });
          if (dom.sidebarOverview) {
            dom.sidebarOverview.hidden = view !== 'settings';
          }
          Object.entries(dom.views).forEach(([key, element]) => {
            if (!element) {
              return;
            }
            const isActive = key === view;
            element.classList.toggle('active', isActive);
            element.hidden = !isActive;
          });
          if (view === 'storage') {
            const browserState = getStorageBrowserState();
            if (
              (!state.storage.initialized && !state.storage.loading) ||
              (!browserState.initialized && !browserState.loading)
            ) {
              void refreshStorage({ includeOverview: true, force: true });
            } else {
              renderStorage();
            }
            stopProgressPolling();
          } else if (view === 'progress') {
            void refreshProgressQueue({ force: true });
            startProgressPolling();
          } else {
            stopProgressPolling();
          }
        }

        function updateStats() {
          const stats = state.stats;
          const entries = [
            [t('stats.classes'), stats.class_count],
            [t('stats.modules'), stats.module_count],
            [t('stats.lectures'), stats.lecture_count],
            [t('stats.transcripts'), stats.transcript_count],
            [t('stats.slideDecks'), stats.slide_count],
            [t('stats.audio'), stats.audio_count],
            [t('stats.processedAudio'), stats.processed_audio_count],
            [t('stats.notes'), stats.notes_count],
            [t('stats.slideArchives'), stats.slide_image_count],
          ];
          dom.stats.innerHTML = '';
          entries.forEach(([label, value]) => {
            const block = document.createElement('div');
            const term = document.createElement('dt');
            term.textContent = label;
            const data = document.createElement('dd');
            data.textContent = formatNumber(value);
            block.appendChild(term);
            block.appendChild(data);
            dom.stats.appendChild(block);
          });
        }

        function updateModuleOptions() {
          const modules = [];
          state.classes.forEach((klass) => {
            (klass.modules || []).forEach((module) => {
              modules.push({
                id: module.id,
                label: `${klass.name} • ${module.name}`,
              });
            });
          });
          modules.sort((a, b) => a.label.localeCompare(b.label));

          dom.createModule.innerHTML = '';
          dom.editModule.innerHTML = '';

          const createPlaceholder = document.createElement('option');
          createPlaceholder.value = '';
          createPlaceholder.textContent = modules.length
            ? t('dropdowns.selectModule')
            : t('dropdowns.noModules');
          createPlaceholder.disabled = modules.length === 0;
          createPlaceholder.selected = true;
          dom.createModule.appendChild(createPlaceholder);

          modules.forEach((module) => {
            const option = document.createElement('option');
            option.value = String(module.id);
            option.textContent = module.label;
            dom.createModule.appendChild(option.cloneNode(true));
            dom.editModule.appendChild(option);
          });

          dom.createModule.disabled = modules.length === 0;
          dom.createSubmit.disabled = modules.length === 0;
        }

        function matchQuery(text, query) {
          return typeof text === 'string' && text.toLowerCase().includes(query);
        }

        function computeFilteredClasses() {
          const query = state.query.trim().toLowerCase();
          if (!query) {
            return state.classes.map((klass) => ({
              class: klass,
              modules: (klass.modules || []).map((module) => ({
                module,
                lectures: module.lectures || [],
              })),
            }));
          }

          const filtered = [];
          state.classes.forEach((klass) => {
            const classMatch = matchQuery(klass.name, query) || matchQuery(klass.description, query);
            const modules = [];
            (klass.modules || []).forEach((module) => {
              const moduleMatch =
                classMatch || matchQuery(module.name, query) || matchQuery(module.description, query);
              let lectures = module.lectures || [];
              if (!moduleMatch) {
                lectures = (module.lectures || []).filter(
                  (lecture) =>
                    matchQuery(lecture.name, query) || matchQuery(lecture.description, query),
                );
              }
              if (moduleMatch && lectures.length === 0) {
                lectures = module.lectures || [];
              }
              if (lectures.length > 0) {
                modules.push({ module, lectures });
              }
            });
            if (modules.length > 0) {
              filtered.push({ class: klass, modules });
            }
          });
          return filtered;
        }

        function highlightSelected() {
          state.buttonMap.forEach((button, lectureId) => {
            if (lectureId === state.selectedLectureId) {
              button.classList.add('active');
              button.setAttribute('aria-current', 'true');
            } else {
              button.classList.remove('active');
              button.removeAttribute('aria-current');
            }
          });
        }

        function findModuleEntry(moduleId) {
          for (const classEntry of state.classes) {
            const modules = classEntry.modules || [];
            for (const moduleEntry of modules) {
              if (moduleEntry && moduleEntry.id === moduleId) {
                if (!Array.isArray(moduleEntry.lectures)) {
                  moduleEntry.lectures = [];
                }
                return { classEntry, moduleEntry };
              }
            }
          }
          return null;
        }

        function findLectureLocation(lectureId) {
          for (const classEntry of state.classes) {
            const modules = classEntry.modules || [];
            for (const moduleEntry of modules) {
              const lectures = moduleEntry.lectures || [];
              for (let index = 0; index < lectures.length; index += 1) {
                if (lectures[index].id === lectureId) {
                  return { classEntry, moduleEntry, index };
                }
              }
            }
          }
          return null;
        }

        function ensureLectureExpansion(lectureId) {
          if (!lectureId) {
            return false;
          }
          const location = findLectureLocation(lectureId);
          if (!location) {
            return false;
          }
          let changed = false;
          const classId = location.classEntry?.id != null ? String(location.classEntry.id) : null;
          if (classId) {
            if (state.expandedClasses.get(classId) !== true) {
              state.expandedClasses.set(classId, true);
              changed = true;
            }
          }
          const moduleId = location.moduleEntry?.id != null ? String(location.moduleEntry.id) : null;
          if (classId && moduleId) {
            const moduleKey = `${classId}:${moduleId}`;
            if (state.expandedModules.get(moduleKey) !== true) {
              state.expandedModules.set(moduleKey, true);
              changed = true;
            }
          }
          return changed;
        }

        function clearDragIndicators() {
          if (!dom.curriculum) {
            return;
          }
          dom.curriculum
            .querySelectorAll('.drop-before, .drop-after')
            .forEach((element) => element.classList.remove('drop-before', 'drop-after'));
          dom.curriculum
            .querySelectorAll('.syllabus-lectures.drop-target')
            .forEach((element) => element.classList.remove('drop-target'));
        }

        function createIconButton(label, icon, ...classNames) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = ['icon-button', ...classNames.filter(Boolean)].join(' ');
          button.setAttribute('aria-label', label);
          button.title = label;

          const iconSpan = document.createElement('span');
          iconSpan.className = 'icon';
          iconSpan.setAttribute('aria-hidden', 'true');
          iconSpan.textContent = icon;
          button.appendChild(iconSpan);

          const srLabel = document.createElement('span');
          srLabel.className = 'sr-only';
          srLabel.textContent = label;
          button.appendChild(srLabel);

          return button;
        }

        function calculateLectureDropPosition(container, moduleId, pointerY) {
          const moduleInfo = findModuleEntry(moduleId);
          if (!moduleInfo) {
            return { index: null, indicator: null, position: null };
          }

          const lectures = moduleInfo.moduleEntry.lectures || [];
          let index = lectures.length;
          let indicator = null;
          let position = null;

          for (let lectureIndex = 0; lectureIndex < lectures.length; lectureIndex += 1) {
            const lecture = lectures[lectureIndex];
            if (!lecture || lecture.id === state.draggingLectureId) {
              continue;
            }

            const element = container.querySelector(
              `.syllabus-lecture[data-lecture-id="${lecture.id}"]`,
            );
            if (!element) {
              continue;
            }

            const rect = element.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            if (typeof pointerY === 'number' && Number.isFinite(pointerY) && pointerY < midpoint) {
              index = lectureIndex;
              indicator = element;
              position = 'before';
              return { index, indicator, position };
            }

            index = lectureIndex + 1;
            indicator = element;
            position = 'after';
          }

          return { index, indicator: indicator ?? null, position };
        }

        function startLectureDrag(event, lecture, moduleId) {
          if (!state.editMode) {
            event.preventDefault();
            return;
          }
          state.draggingLectureId = lecture.id;
          state.draggingSourceModuleId = moduleId;
          state.draggedElement = event.currentTarget || null;
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            try {
              event.dataTransfer.setData('text/plain', String(lecture.id));
            } catch (error) {
              // Ignore data transfer errors in unsupported browsers.
            }
          }
          if (state.draggedElement) {
            state.draggedElement.classList.add('dragging');
          }
        }

        function clearLectureDrag(event) {
          const element = (event && event.currentTarget) || state.draggedElement;
          if (element) {
            element.classList.remove('dragging');
          }
          state.draggingLectureId = null;
          state.draggingSourceModuleId = null;
          state.draggedElement = null;
          clearDragIndicators();
        }

        function handleLectureDragOver(event) {
          if (!state.editMode || !state.draggingLectureId) {
            return;
          }
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
          }
          const container = event.currentTarget;
          if (!container || !container.classList) {
            return;
          }
          container.classList.add('drop-target');
          container
            .querySelectorAll('.drop-before, .drop-after')
            .forEach((element) => element.classList.remove('drop-before', 'drop-after'));
          const moduleId = Number(container.dataset.moduleId);
          if (!Number.isFinite(moduleId)) {
            return;
          }
          const { indicator, position } = calculateLectureDropPosition(
            container,
            moduleId,
            event.clientY,
          );
          if (!indicator || !position) {
            return;
          }
          indicator.classList.add(position === 'before' ? 'drop-before' : 'drop-after');
        }

        function handleLectureDragLeave(event) {
          const container = event.currentTarget;
          if (!container) {
            return;
          }
          const related = event.relatedTarget;
          if (!related || (!container.contains(related) && related !== container)) {
            container.classList.remove('drop-target');
            container
              .querySelectorAll('.drop-before, .drop-after')
              .forEach((element) => element.classList.remove('drop-before', 'drop-after'));
          }
        }

        async function handleLectureDrop(event, targetModuleId) {
          if (!state.editMode || !state.draggingLectureId) {
            return;
          }
          event.preventDefault();
          const container = event.currentTarget;
          if (container) {
            container.classList.remove('drop-target');
            container
              .querySelectorAll('.drop-before, .drop-after')
              .forEach((element) => element.classList.remove('drop-before', 'drop-after'));
          }
          let targetIndex = null;
          if (container) {
            const { index } = calculateLectureDropPosition(container, targetModuleId, event.clientY);
            if (typeof index === 'number' && Number.isFinite(index)) {
              targetIndex = index;
            }
          }
          await performLectureReorder(state.draggingLectureId, targetModuleId, targetIndex);
        }

        async function performLectureReorder(lectureId, targetModuleId, targetIndex) {
          const sourceInfo = findLectureLocation(lectureId);
          const targetInfo = findModuleEntry(targetModuleId);
          if (!sourceInfo || !targetInfo) {
            clearDragIndicators();
            return;
          }

          const sourceModuleId = sourceInfo.moduleEntry.id;
          if (!Array.isArray(sourceInfo.moduleEntry.lectures)) {
            sourceInfo.moduleEntry.lectures = [];
          }
          if (!Array.isArray(targetInfo.moduleEntry.lectures)) {
            targetInfo.moduleEntry.lectures = [];
          }
          const sourceLectures = sourceInfo.moduleEntry.lectures;
          const targetLectures = targetInfo.moduleEntry.lectures;

          let insertionIndex =
            typeof targetIndex === 'number' && Number.isFinite(targetIndex)
              ? targetIndex
              : targetLectures.length;

          if (sourceModuleId === targetModuleId) {
            if (insertionIndex > sourceInfo.index) {
              insertionIndex -= 1;
            }
            if (insertionIndex === sourceInfo.index) {
              clearDragIndicators();
              return;
            }
          }

          const lectureRecord = sourceLectures[sourceInfo.index];
          sourceLectures.splice(sourceInfo.index, 1);

          if (insertionIndex < 0 || insertionIndex > targetLectures.length) {
            insertionIndex = targetLectures.length;
          }

          lectureRecord.module_id = targetModuleId;
          targetLectures.splice(insertionIndex, 0, lectureRecord);

          if (state.draggedElement) {
            state.draggedElement.classList.remove('dragging');
          }

          const modulesToUpdate = new Map();
          modulesToUpdate.set(sourceModuleId, sourceInfo.moduleEntry);
          modulesToUpdate.set(targetModuleId, targetInfo.moduleEntry);

          sourceInfo.moduleEntry.lecture_count = sourceLectures.length;
          targetInfo.moduleEntry.lecture_count = targetLectures.length;

          state.draggingLectureId = null;
          state.draggingSourceModuleId = null;
          state.draggedElement = null;

          renderCurriculum();

          const payload = {
            modules: Array.from(modulesToUpdate.values()).map((moduleEntry) => ({
              module_id: moduleEntry.id,
              lecture_ids: (moduleEntry.lectures || []).map((item) => item.id),
            })),
          };

          try {
            await request('/api/lectures/reorder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            await refreshData();
            showStatus(t('status.lectureReordered'), 'success');
          } catch (error) {
            showStatus(error.message, 'error');
            await refreshData();
          }
        }

        function renderCurriculum() {
          state.buttonMap.clear();
          const filtered = computeFilteredClasses();
          dom.curriculum.innerHTML = '';

          if (state.editMode) {
            const toolbar = document.createElement('div');
            toolbar.className = 'curriculum-toolbar';

            const heading = document.createElement('h3');
            heading.textContent = t('curriculum.manageHeading');
            toolbar.appendChild(heading);

            const actions = document.createElement('div');
            actions.className = 'curriculum-toolbar-actions';

            const addClassButton = createIconButton(t('curriculum.addClass'), '+');
            addClassButton.addEventListener('click', (event) => {
              event.preventDefault();
              handleAddClass();
            });
            actions.appendChild(addClassButton);

            toolbar.appendChild(actions);
            dom.curriculum.appendChild(toolbar);
          }

          if (filtered.length === 0) {
            const message = document.createElement('div');
            message.className = 'placeholder';
            message.textContent = state.classes.length
              ? t('placeholders.noLecturesFilter')
              : t('placeholders.noClasses');
            dom.curriculum.appendChild(message);
            return;
          }

          const syllabus = document.createElement('div');
          syllabus.className = 'syllabus';

          filtered.forEach((entry) => {
            const classDetails = document.createElement('details');
            classDetails.className = 'syllabus-class';
            const classId = entry.class?.id != null ? String(entry.class.id) : null;
            const hasSelection = entry.modules.some((moduleEntry) =>
              (moduleEntry.lectures || []).some(
                (lecture) => lecture.id === state.selectedLectureId,
              ),
            );
            let expandClass = Boolean(hasSelection);
            if (classId) {
              const storedValue = state.expandedClasses.get(classId);
              if (typeof storedValue === 'boolean') {
                expandClass = storedValue;
              }
              if (hasSelection) {
                expandClass = true;
                state.expandedClasses.set(classId, true);
              }
              classDetails.dataset.classId = classId;
              classDetails.addEventListener('toggle', () => {
                state.expandedClasses.set(classId, classDetails.open);
              });
            }
            classDetails.open = expandClass;

            const summary = document.createElement('summary');
            summary.className = 'syllabus-summary';

            const summaryText = document.createElement('div');
            summaryText.className = 'syllabus-summary-text';

            const title = document.createElement('span');
            title.className = 'syllabus-title';
            title.textContent = entry.class.name;
            summaryText.appendChild(title);

            const moduleCount = entry.modules.length;
            const lectureCount = entry.modules.reduce(
              (total, moduleEntry) => total + (moduleEntry.lectures?.length || 0),
              0,
            );
            const moduleWord = pluralize(currentLanguage, 'counts.module', moduleCount);
            const lectureWord = pluralize(currentLanguage, 'counts.lecture', lectureCount);
            const meta = document.createElement('span');
            meta.className = 'syllabus-meta';
            meta.textContent = t('curriculum.classMeta', {
              moduleCount,
              moduleWord,
              lectureCount,
              lectureWord,
            });
            summaryText.appendChild(meta);

            summary.appendChild(summaryText);

            if (state.editMode) {
              const actions = document.createElement('div');
              actions.className = 'syllabus-actions';

              const addModuleButton = createIconButton(t('curriculum.addModule'), '+');
              addModuleButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                handleAddModule(entry.class);
              });
              actions.appendChild(addModuleButton);

              const deleteClassButton = createIconButton(t('common.actions.delete'), '×', 'danger');
              deleteClassButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                handleDeleteClass(entry);
              });
              actions.appendChild(deleteClassButton);

              summary.appendChild(actions);
            }

            classDetails.appendChild(summary);

            const content = document.createElement('div');
            content.className = 'syllabus-content';

            if (!entry.modules.length) {
              const emptyModules = document.createElement('div');
              emptyModules.className = 'placeholder';
              emptyModules.textContent = t('placeholders.noModules');
              content.appendChild(emptyModules);
            } else {
              const modulesContainer = document.createElement('div');
              modulesContainer.className = 'syllabus-modules';

              entry.modules.forEach((moduleEntry) => {
                const moduleDetails = document.createElement('details');
                moduleDetails.className = 'syllabus-module';
                const moduleHasSelection = (moduleEntry.lectures || []).some(
                  (lecture) => lecture.id === state.selectedLectureId,
                );
                const moduleId = moduleEntry.module?.id != null ? String(moduleEntry.module.id) : null;
                let expandModule = Boolean(moduleHasSelection);
                if (classId && moduleId) {
                  const moduleKey = `${classId}:${moduleId}`;
                  const storedModuleValue = state.expandedModules.get(moduleKey);
                  if (typeof storedModuleValue === 'boolean') {
                    expandModule = storedModuleValue;
                  }
                  if (moduleHasSelection) {
                    expandModule = true;
                    state.expandedModules.set(moduleKey, true);
                  }
                  moduleDetails.dataset.classId = classId;
                  moduleDetails.dataset.moduleId = moduleId;
                  moduleDetails.addEventListener('toggle', () => {
                    state.expandedModules.set(moduleKey, moduleDetails.open);
                  });
                }
                moduleDetails.open = expandModule;

                const moduleSummary = document.createElement('summary');
                moduleSummary.className = 'syllabus-summary';

                const moduleSummaryText = document.createElement('div');
                moduleSummaryText.className = 'syllabus-summary-text';

                const moduleTitle = document.createElement('span');
                moduleTitle.className = 'syllabus-title';
                moduleTitle.textContent = moduleEntry.module.name;
                moduleSummaryText.appendChild(moduleTitle);

                const moduleLectureCount = moduleEntry.lectures.length;
                const moduleLectureWord = pluralize(
                  currentLanguage,
                  'counts.lecture',
                  moduleLectureCount,
                );
                const moduleMeta = document.createElement('span');
                moduleMeta.className = 'syllabus-meta';
                moduleMeta.textContent = t('curriculum.moduleMeta', {
                  lectureCount: moduleLectureCount,
                  lectureWord: moduleLectureWord,
                });
                moduleSummaryText.appendChild(moduleMeta);

                moduleSummary.appendChild(moduleSummaryText);

                if (state.editMode) {
                  const moduleActions = document.createElement('div');
                  moduleActions.className = 'syllabus-actions';

                  const deleteModuleButton = createIconButton(
                    t('common.actions.delete'),
                    '×',
                    'danger',
                  );
                  deleteModuleButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleDeleteModule(moduleEntry, entry.class);
                  });
                  moduleActions.appendChild(deleteModuleButton);

                  moduleSummary.appendChild(moduleActions);
                }

                moduleDetails.appendChild(moduleSummary);

                const moduleContent = document.createElement('div');
                moduleContent.className = 'syllabus-content';

                const lectureList = document.createElement('ul');
                lectureList.className = 'syllabus-lectures';
                lectureList.dataset.moduleId = String(moduleEntry.module.id);

                if (!moduleEntry.lectures.length) {
                  lectureList.classList.add('empty');
                  const emptyLectures = document.createElement('li');
                  emptyLectures.className = 'placeholder';
                  emptyLectures.textContent = t('placeholders.noLectures');
                  emptyLectures.setAttribute('aria-hidden', 'true');
                  lectureList.appendChild(emptyLectures);
                } else {
                  moduleEntry.lectures.forEach((lecture) => {
                    const lectureItem = document.createElement('li');
                    lectureItem.className = 'syllabus-lecture';
                    lectureItem.dataset.lectureId = String(lecture.id);

                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'lecture-button';
                    button.textContent = lecture.name;
                    button.addEventListener('click', (event) => {
                      event.preventDefault();
                      selectLecture(lecture.id);
                    });
                    lectureItem.appendChild(button);
                    state.buttonMap.set(lecture.id, button);

                    if (state.editMode) {
                      lectureItem.draggable = true;
                      lectureItem.addEventListener('dragstart', (event) => {
                        startLectureDrag(event, lecture, moduleEntry.module.id);
                      });
                      lectureItem.addEventListener('dragend', clearLectureDrag);

                      const deleteLectureButton = createIconButton(
                        t('common.actions.delete'),
                        '×',
                        'danger',
                      );
                      deleteLectureButton.addEventListener('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleDeleteLecture(lecture, moduleEntry.module, entry.class);
                      });
                      lectureItem.appendChild(deleteLectureButton);
                    }

                    lectureList.appendChild(lectureItem);
                  });
                }

                if (state.editMode) {
                  const dropHandler = (event) => handleLectureDrop(event, moduleEntry.module.id);
                  lectureList.addEventListener('dragover', handleLectureDragOver);
                  lectureList.addEventListener('dragleave', handleLectureDragLeave);
                  lectureList.addEventListener('drop', dropHandler);
                }

                moduleContent.appendChild(lectureList);

                moduleDetails.appendChild(moduleContent);
                modulesContainer.appendChild(moduleDetails);
              });

              content.appendChild(modulesContainer);
            }

            classDetails.appendChild(content);
            syllabus.appendChild(classDetails);
          });

          dom.curriculum.appendChild(syllabus);
          highlightSelected();
        }

        function pruneExpansionState() {
          const classIds = new Set(
            state.classes.map((klass) => (klass?.id != null ? String(klass.id) : null)).filter(Boolean),
          );
          state.expandedClasses.forEach((_, key) => {
            if (!classIds.has(key)) {
              state.expandedClasses.delete(key);
            }
          });

          const moduleKeys = new Set();
          state.classes.forEach((klass) => {
            const classId = klass?.id != null ? String(klass.id) : null;
            if (!classId) {
              return;
            }
            (klass.modules || []).forEach((module) => {
              if (module?.id == null) {
                return;
              }
              moduleKeys.add(`${classId}:${module.id}`);
            });
          });
          state.expandedModules.forEach((_, key) => {
            if (!moduleKeys.has(key)) {
              state.expandedModules.delete(key);
            }
          });
        }

        function requireEditMode(message = t('status.requireEdit')) {
          if (!state.editMode) {
            showStatus(message, 'info');
            return false;
          }
          return true;
        }

        async function handleAddClass() {
          if (!requireEditMode()) {
            return;
          }
          const name = await promptDialog({
            title: t('dialogs.createClass.title'),
            message: t('dialogs.createClass.message'),
            confirmText: t('common.actions.create'),
            placeholder: t('dialogs.createClass.placeholder'),
            required: true,
          });
          if (!name || !name.trim()) {
            return;
          }
          try {
            await request('/api/classes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: name.trim() }),
            });
            showStatus(t('status.classCreated'), 'success');
            await refreshData();
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        async function handleAddModule(classRecord) {
          if (!requireEditMode()) {
            return;
          }
          const name = await promptDialog({
            title: t('dialogs.createModule.title'),
            message: t('dialogs.createModule.message', { className: classRecord.name }),
            confirmText: t('common.actions.create'),
            placeholder: t('dialogs.createModule.placeholder'),
            required: true,
          });
          if (!name || !name.trim()) {
            return;
          }
          try {
            await request('/api/modules', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                class_id: classRecord.id,
                name: name.trim(),
              }),
            });
            showStatus(t('status.moduleCreated'), 'success');
            await refreshData();
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        async function handleDeleteClass(classEntry) {
          if (!requireEditMode()) {
            return;
          }
          const moduleCount = classEntry.modules.length;
          const lectureCount = classEntry.modules.reduce(
            (total, moduleEntry) => total + (moduleEntry.lectures?.length || 0),
            0,
          );
          const moduleWord = pluralize(currentLanguage, 'counts.module', moduleCount);
          const lectureWord = pluralize(currentLanguage, 'counts.lecture', lectureCount);
          let message = t('dialogs.deleteClass.message', { className: classEntry.class.name });
          if (moduleCount || lectureCount) {
            message += `\n\n${t('dialogs.deleteClass.summary', {
              moduleCount,
              moduleWord,
              lectureCount,
              lectureWord,
            })}`;
          }
          const confirmed = await confirmDialog({
            title: t('dialogs.deleteClass.title'),
            message,
            confirmText: t('common.actions.delete'),
            cancelText: t('dialogs.deleteClass.cancel'),
            variant: 'danger',
          });
          if (!confirmed) {
            return;
          }
          try {
            await request(`/api/classes/${classEntry.class.id}`, { method: 'DELETE' });
            if (state.selectedLectureId) {
              const removed = classEntry.modules.some((moduleEntry) =>
                (moduleEntry.lectures || []).some(
                  (lecture) => lecture.id === state.selectedLectureId,
                ),
              );
              if (removed) {
                state.selectedLectureId = null;
                clearDetailPanel();
              }
            }
            showStatus(t('status.classRemoved'), 'success');
            await refreshData();
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        async function handleDeleteModule(moduleEntry, classRecord) {
          if (!requireEditMode()) {
            return;
          }
          const lectureCount = moduleEntry.lectures.length;
          const classContext = classRecord
            ? t('dialogs.deleteModule.classContext', { className: classRecord.name })
            : '';
          let message = t('dialogs.deleteModule.message', {
            moduleName: moduleEntry.module.name,
            classContext,
          });
          if (lectureCount) {
            const lectureWord = pluralize(currentLanguage, 'counts.lecture', lectureCount);
            message += `\n\n${t('dialogs.deleteModule.summary', {
              lectureCount,
              lectureWord,
            })}`;
          }
          const confirmed = await confirmDialog({
            title: t('dialogs.deleteModule.title'),
            message,
            confirmText: t('common.actions.delete'),
            cancelText: t('dialogs.deleteModule.cancel'),
            variant: 'danger',
          });
          if (!confirmed) {
            return;
          }
          try {
            await request(`/api/modules/${moduleEntry.module.id}`, { method: 'DELETE' });
            if (state.selectedLectureId) {
              const removed = (moduleEntry.lectures || []).some(
                (lecture) => lecture.id === state.selectedLectureId,
              );
              if (removed) {
                state.selectedLectureId = null;
                clearDetailPanel();
              }
            }
            showStatus(t('status.moduleRemoved'), 'success');
            await refreshData();
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        async function handleAddLecture(moduleRecord, classRecord) {
          if (!requireEditMode()) {
            return;
          }
          const contextParts = classRecord
            ? [classRecord.name, moduleRecord.name]
            : [moduleRecord.name];
          const namePrompt = contextParts.join(' • ');
          const name = await promptDialog({
            title: t('dialogs.createLecture.title'),
            message: t('dialogs.createLecture.message', { context: namePrompt }),
            confirmText: t('common.actions.create'),
            placeholder: t('dialogs.createLecture.placeholder'),
            required: true,
          });
          if (!name || !name.trim()) {
            return;
          }
          const description =
            (await promptDialog({
              title: t('dialogs.lectureDescription.title'),
              message: t('dialogs.descriptionOptional'),
              confirmText: t('common.actions.save'),
              cancelText: t('common.actions.skip'),
              placeholder: t('dialogs.lectureDescription.placeholder'),
            })) ?? '';
          try {
            const payload = await request('/api/lectures', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                module_id: moduleRecord.id,
                name: name.trim(),
                description: description.trim(),
              }),
            });
            showStatus(t('status.lectureCreated'), 'success');
            await refreshData();
            const newLectureId = payload?.lecture?.id;
            if (newLectureId) {
              await selectLecture(newLectureId);
            }
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        async function handleDeleteLecture(lecture, moduleRecord, classRecord) {
          if (!requireEditMode()) {
            return;
          }
          const contextParts = [lecture.name];
          if (moduleRecord) {
            contextParts.push(moduleRecord.name);
          }
          if (classRecord) {
            contextParts.push(classRecord.name);
          }
          const context = contextParts.join(' • ');
          const confirmed = await confirmDialog({
            title: t('dialogs.deleteLecture.title'),
            message: t('dialogs.deleteLecture.message', { context }),
            confirmText: t('common.actions.delete'),
            cancelText: t('dialogs.deleteLecture.cancel'),
            variant: 'danger',
          });
          if (!confirmed) {
            return;
          }
          try {
            await request(`/api/lectures/${lecture.id}`, { method: 'DELETE' });
            if (state.selectedLectureId === lecture.id) {
              state.selectedLectureId = null;
              clearDetailPanel();
            }
            showStatus(t('status.lectureRemoved'), 'success');
            await refreshData();
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        function applyTheme(theme) {
          const target = theme || 'system';
          document.body.dataset.theme = target;
        }

        async function loadSettings() {
          try {
            const payload = await request('/api/settings');
            const settings = payload?.settings;
            if (!settings) {
              return;
            }
            syncSettingsForm(settings);
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        function renderAssets(lecture) {
          dom.assetList.innerHTML = '';
          setTranscribeControls(null, null, null);
          assetDefinitions.forEach((definition) => {
            const value = lecture[definition.key];
            if (
              definition.type === 'processed_audio' &&
              (!value || value === lecture.audio_path)
            ) {
              return;
            }
            const item = document.createElement('li');
            item.className = 'asset-item';
            const header = document.createElement('div');
            header.className = 'asset-header';
            header.textContent = t(definition.labelKey);
            item.appendChild(header);

            const status = document.createElement('div');
            status.className = 'asset-status';
            let statusText = t('assets.status.notLinked');
            if (value) {
              const fileName = value.split('/').pop();
              if (definition.type === 'slides') {
                statusText = t('assets.status.slidesUploaded', { name: fileName });
              } else if (definition.type === 'slide_bundle') {
                statusText = t('assets.status.archiveCreated', { name: fileName });
              } else if (definition.type === 'processed_audio') {
                statusText = t('assets.status.mastered', { name: fileName });
              } else {
                statusText = t('assets.status.linked', { name: fileName });
              }
            } else if (definition.type === 'slides') {
              statusText = t('assets.status.slidesHint');
            } else if (definition.type === 'slide_bundle') {
              statusText = t('assets.status.noSlideImages');
            }
            status.textContent = statusText;
            item.appendChild(status);

            const actions = document.createElement('div');
            actions.className = 'asset-actions';

            let transcribeButton = null;
            let modelLabel = null;
            let modelSelect = null;
            let gpuOption = null;

            if (definition.accept) {
              const uploadButton = document.createElement('button');
              uploadButton.type = 'button';
              uploadButton.className = 'secondary';
              uploadButton.textContent = t('assets.actions.upload');
              uploadButton.addEventListener('click', () => {
                handleAssetUpload(definition);
              });
              actions.appendChild(uploadButton);
            }

            if (definition.type === 'audio') {
              transcribeButton = document.createElement('button');
              transcribeButton.type = 'button';
              transcribeButton.className = 'secondary';
              transcribeButton.setAttribute('data-i18n', 'assets.transcribe');
              transcribeButton.textContent = t('assets.transcribe');
              transcribeButton.disabled = !value;
              actions.appendChild(transcribeButton);

              modelLabel = document.createElement('label');
              modelLabel.className = 'inline';
              modelLabel.textContent = t('assets.modelLabel');
              modelLabel.setAttribute('for', 'transcribe-model');
              modelLabel.style.marginLeft = 'auto';

              modelSelect = document.createElement('select');
              modelSelect.id = 'transcribe-model';
              const modelChoices = ['tiny', 'base', 'small', 'medium', 'large', 'gpu'];
              modelChoices.forEach((choice) => {
                const option = document.createElement('option');
                option.value = choice;
                option.setAttribute('data-i18n', `assets.model.${choice}`);
                option.textContent = t(`assets.model.${choice}`);
                if (choice === GPU_MODEL) {
                  option.classList.add('gpu-only');
                  option.disabled = true;
                  gpuOption = option;
                }
                modelSelect.appendChild(option);
              });
              const requestedModel = normalizeWhisperModel(
                state.settings?.whisper_model_requested || state.settings?.whisper_model,
              );
              modelSelect.value = requestedModel;
              modelLabel.appendChild(modelSelect);
            }

            const downloadButton = document.createElement('button');
            downloadButton.type = 'button';
            downloadButton.className = 'secondary';
            downloadButton.textContent = t('assets.actions.download');
            downloadButton.disabled = !value;
            downloadButton.addEventListener('click', () => {
              if (!value) {
                return;
              }
              const downloadUrl = buildStorageURL(value);
              const fallbackName = definition.type ? `${definition.type}.bin` : 'asset.bin';
              const fileName = value.split('/').pop() || fallbackName;
              const anchor = document.createElement('a');
              anchor.href = downloadUrl;
              anchor.download = fileName;
              anchor.rel = 'noopener';
              anchor.style.display = 'none';
              document.body.appendChild(anchor);
              anchor.click();
              anchor.remove();
            });

            if (definition.type === 'slides') {
              const isProcessing = state.processingProgressLectureId === lecture.id;
              const processSlidesButton = document.createElement('button');
              processSlidesButton.type = 'button';
              processSlidesButton.className = 'secondary';
              processSlidesButton.setAttribute('data-i18n', 'assets.actions.processSlides');
              processSlidesButton.textContent = t('assets.actions.processSlides');
              processSlidesButton.disabled = !value || isProcessing;
              processSlidesButton.addEventListener('click', () => {
                handleSlideProcessing(definition);
              });
              actions.appendChild(processSlidesButton);
            }

            actions.appendChild(downloadButton);

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'danger';
            removeButton.textContent = t('assets.actions.remove');
            removeButton.disabled = !value;
            removeButton.addEventListener('click', () => {
              if (!value) {
                return;
              }
              handleAssetRemoval(definition);
            });
            actions.appendChild(removeButton);

            if (definition.type === 'audio' && modelLabel && modelSelect) {
              actions.appendChild(modelLabel);
              setTranscribeControls(transcribeButton, modelSelect, gpuOption);
              setTranscribeButtonDisabled(!value);
            }

            item.appendChild(actions);
            dom.assetList.appendChild(item);
          });
        }

        function renderSummary(detail) {
          const lecture = detail.lecture;
          const module = detail.module;
          const classRecord = detail.class;

          dom.summary.classList.remove('placeholder');
          dom.summary.innerHTML = '';

          const title = document.createElement('h3');
          title.textContent = lecture.name;
          dom.summary.appendChild(title);

          const context = document.createElement('div');
          context.className = 'asset-status';
          context.textContent = `${classRecord.name} • ${module.name}`;
          dom.summary.appendChild(context);

          const description = document.createElement('p');
          description.textContent = lecture.description || t('details.noDescription');
          dom.summary.appendChild(description);
        }

        async function refreshData() {
          try {
            const payload = await request('/api/classes');
            state.classes = payload?.classes || [];
            state.stats = payload?.stats || {};
            pruneExpansionState();
            state.storage.initialized = false;
            state.storage.overview = null;
            state.storage.usage = null;
            const storageBrowser = getStorageBrowserState();
            storageBrowser.initialized = false;
            storageBrowser.entries = [];
            storageBrowser.path = '';
            storageBrowser.parent = null;
            storageBrowser.error = null;
            storageBrowser.deleting.clear();
            updateStats();
            updateModuleOptions();
            renderCurriculum();

            if (state.selectedLectureId) {
              const exists = state.classes.some((klass) =>
                (klass.modules || []).some((module) =>
                  (module.lectures || []).some((lecture) => lecture.id === state.selectedLectureId),
                ),
              );
              if (!exists) {
                state.selectedLectureId = null;
                clearDetailPanel();
              }
            }
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        async function selectLecture(lectureId) {
          state.selectedLectureId = lectureId;
          state.selectedLectureDetail = null;
          const expanded = ensureLectureExpansion(lectureId);
          if (expanded) {
            renderCurriculum();
          }
          highlightSelected();
          setActiveView('details');
          try {
            const detail = await request(`/api/lectures/${lectureId}`);
            if (!detail) {
              return;
            }
            state.selectedLectureDetail = detail;
            renderSummary(detail);
            dom.assetSection.hidden = false;

            dom.editName.value = detail.lecture.name;
            dom.editDescription.value = detail.lecture.description || '';
            dom.editModule.value = String(detail.lecture.module_id);

            updateEditControlsAvailability();

            if (state.editMode) {
              dom.editName.focus();
            }

            setTranscribeButtonDisabled(!detail.lecture.audio_path);

            renderAssets(detail.lecture);
          } catch (error) {
            state.selectedLectureDetail = null;
            showStatus(error.message, 'error');
          }
        }

        async function handleAssetRemoval(definition) {
          if (!definition || !state.selectedLectureId) {
            return;
          }

          const kind = definition.type;
          if (!kind) {
            return;
          }

          const lectureId = state.selectedLectureId;
          const assetLabel = t(definition.labelKey);
          const confirmed = await confirmDialog({
            title: t('dialogs.removeAsset.title', { asset: assetLabel }),
            message: t('dialogs.removeAsset.message', { asset: assetLabel }),
            confirmText: t('dialogs.removeAsset.confirm'),
            cancelText: t('dialog.cancel'),
            variant: 'danger',
          });

          if (!confirmed) {
            return;
          }

          try {
            await request(`/api/lectures/${lectureId}/assets/${kind}`, { method: 'DELETE' });
            showStatus(t('status.assetRemoved'), 'success');
            await refreshData();
            await selectLecture(lectureId);
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        async function handleAssetUpload(definition) {
          if (!definition || !state.selectedLectureId) {
            return;
          }

          const lectureId = state.selectedLectureId;
          const kind = definition.type;
          const assetLabel = t(definition.labelKey);
          let audioProcessingStarted = false;

          const allowAudioBackground =
            kind === 'audio' && state.settings?.audio_mastering_enabled !== false;
          const allowBackgroundProcessing = allowAudioBackground;
          const enableProcessingStage = allowBackgroundProcessing;
          const processingLabel =
            kind === 'audio' ? t('dialogs.upload.processingAudio') : undefined;
          const backgroundProcessingLabel =
            kind === 'audio' ? t('dialogs.upload.backgroundProcessing') : undefined;

          const dialogResult = await showUploadDialog({
            accept: definition.accept || '',
            title: t('dialogs.upload.assetTitle', { asset: assetLabel }),
            description: t('dialogs.upload.assetDescription'),
            prompt: t('dialogs.upload.prompt'),
            help: t('dialogs.upload.help'),
            browseLabel: t('dialogs.upload.browse'),
            clearLabel: t('dialogs.upload.clear'),
            uploadLabel: t('dialogs.upload.action'),
            processing: processingLabel,
            processingAction: t('dialogs.upload.processingAction'),
            allowBackgroundProcessing,
            enableProcessingStage,
            backgroundProcessing: backgroundProcessingLabel,
            onFileSelected: null,
            onUpload: async (file, helpers) => {
              const formData = new FormData();
              let endpoint = `/api/lectures/${lectureId}/assets/${kind}`;
              formData.append('file', file);

              if (kind === 'audio') {
                stopTranscriptionProgress();
                stopProcessingProgress();
                state.lastProgressMessage = '';
                state.lastProgressRatio = null;
                if (allowAudioBackground) {
                  startProcessingProgress(lectureId);
                  audioProcessingStarted = true;
                } else {
                  audioProcessingStarted = false;
                }
              }

              try {
                const response = await uploadWithProgress(endpoint, {
                  method: 'POST',
                  body: formData,
                  onProgress: (ratio) => {
                    helpers?.reportProgress?.(ratio);
                  },
                });
                return response;
              } catch (error) {
                if (kind === 'audio' && audioProcessingStarted) {
                  stopProcessingProgress();
                  audioProcessingStarted = false;
                }
                throw error;
              }
            },
          });

          const backgroundProcessingActive = Boolean(
            (dialogResult && dialogResult.processing) ||
              (dialogResult && dialogResult.result && dialogResult.result.processing)
          );

          if (!dialogResult || (!dialogResult.uploaded && !backgroundProcessingActive)) {
            if (kind === 'audio' && audioProcessingStarted) {
              stopProcessingProgress();
              audioProcessingStarted = false;
            }
            return;
          }

          if (!dialogResult.confirmed) {
            if (!backgroundProcessingActive) {
              await refreshData();
              await selectLecture(lectureId);
              if (kind === 'audio' && audioProcessingStarted) {
                stopProcessingProgress({ preserveMessage: true });
                audioProcessingStarted = false;
              }
            }
            return;
          }

          const successMessage =
            kind === 'slides' ? t('status.slidesUploaded') : t('status.assetUploaded');
          if (kind === 'audio') {
            if (allowAudioBackground) {
              showStatus(t('status.audioProcessingQueued'), 'info', { persist: true });
            } else {
              showStatus(successMessage, 'success');
            }
          } else {
            showStatus(successMessage, 'success');
          }
          await refreshData();
          await selectLecture(lectureId);
          if (kind === 'audio' && audioProcessingStarted && !backgroundProcessingActive) {
            stopProcessingProgress({ preserveMessage: true });
            audioProcessingStarted = false;
          }
        }

        async function handleSlideProcessing(definition) {
          if (!definition || definition.type !== 'slides' || !state.selectedLectureId) {
            return;
          }

          const lectureId = state.selectedLectureId;
          const detail = state.selectedLectureDetail;
          const slidePath = detail?.lecture?.slide_path;
          if (!slidePath) {
            showStatus(t('status.slidesUploadRequired'), 'info');
            return;
          }

          let preview = null;
          try {
            preview = await createSlidePreview(lectureId, null, { source: 'existing' });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showStatus(message, 'error');
            return;
          }

          if (!preview) {
            showStatus(t('status.slidePreviewFailed'), 'error');
            return;
          }

          const previewSource = {
            url: preview.url,
            withCredentials: true,
            previewId: preview.id,
            lectureId,
            pageCount:
              typeof preview.pageCount === 'number' && Number.isFinite(preview.pageCount)
                ? Math.max(0, Math.round(preview.pageCount))
                : null,
          };

          let selection;
          try {
            selection = await showSlideRangeDialog(previewSource);
          } catch (error) {
            await deleteSlidePreview(lectureId, preview.id);
            const message = error instanceof Error ? error.message : String(error);
            showStatus(message, 'error');
            return;
          }
          if (!selection || !selection.confirmed) {
            await deleteSlidePreview(lectureId, preview.id);
            return;
          }

          const formData = new FormData();
          formData.append('use_existing', 'true');
          if (typeof selection.pageStart === 'number' && Number.isFinite(selection.pageStart)) {
            formData.append('page_start', String(selection.pageStart));
          }
          if (typeof selection.pageEnd === 'number' && Number.isFinite(selection.pageEnd)) {
            formData.append('page_end', String(selection.pageEnd));
          }
          try {
            await deleteSlidePreview(lectureId, preview.id);
          } catch (error) {
            console.warn('Failed to remove slide preview before processing', error);
          }

          stopProcessingProgress();
          state.lastProgressMessage = '';
          state.lastProgressRatio = null;
          startProcessingProgress(lectureId);
          showStatus(t('status.processingSlides'), 'info', { persist: true });

          try {
            await request(`/api/lectures/${lectureId}/process-slides`, {
              method: 'POST',
              body: formData,
            });
            showStatus(t('status.slidesProcessed'), 'success');
            await refreshData();
            await selectLecture(lectureId);
          } catch (error) {
            stopProcessingProgress();
            const message = error instanceof Error ? error.message : String(error);
            showStatus(message, 'error');
          }
        }

        if (dom.storage && dom.storage.refresh) {
          dom.storage.refresh.addEventListener('click', () => {
            void refreshStorage({ includeOverview: true, force: true });
          });
        }

        if (dom.storage && dom.storage.browser && dom.storage.browser.navRoot) {
          dom.storage.browser.navRoot.addEventListener('click', () => {
            void refreshStorage({ includeOverview: false, path: '', force: true });
          });
        }

        if (dom.storage && dom.storage.browser && dom.storage.browser.navUp) {
          dom.storage.browser.navUp.addEventListener('click', () => {
            const browserState = getStorageBrowserState();
            if (browserState.parent === null) {
              return;
            }
            const parentPath = browserState.parent || '';
            void refreshStorage({ includeOverview: false, path: parentPath, force: true });
          });
        }

        if (dom.storage && dom.storage.browser && dom.storage.browser.tableBody) {
          dom.storage.browser.tableBody.addEventListener('click', (event) => {
            void handleStorageBrowserAction(event);
          });
          dom.storage.browser.tableBody.addEventListener('change', (event) => {
            handleStorageSelectionChange(event);
          });
        }

        if (dom.storage && dom.storage.browser && dom.storage.browser.selectAll) {
          dom.storage.browser.selectAll.addEventListener('change', (event) => {
            handleStorageSelectAll(event);
          });
        }

        if (dom.storage && dom.storage.downloadSelected) {
          dom.storage.downloadSelected.addEventListener('click', () => {
            void handleStorageDownloadSelected();
          });
        }

        if (dom.storage && dom.storage.purge) {
          dom.storage.purge.addEventListener('click', () => {
            handlePurgeProcessedAudio();
          });
        }

        if (dom.progress && dom.progress.refresh) {
          dom.progress.refresh.addEventListener('click', () => {
            void refreshProgressQueue({ force: true });
          });
        }

        if (dom.progress && dom.progress.list) {
          dom.progress.list.addEventListener('click', (event) => {
            void handleProgressAction(event);
          });
        }

        dom.viewButtons.forEach((button) => {
          button.addEventListener('click', () => {
            const view = button.dataset.view;
            if (!view) {
              return;
            }
            setActiveView(view);
            if (view === 'create') {
              dom.createModule.focus();
            } else if (view === 'details' && state.editMode && state.selectedLectureId) {
              dom.editName.focus();
            }
          });
        });

        if (dom.editToggle) {
          dom.editToggle.addEventListener('click', () => {
            state.editMode = !state.editMode;
            updateEditModeUI();
            if (state.editMode && state.selectedLectureId) {
              setActiveView('details');
              dom.editName.focus();
            }
          });
        }

        dom.search.addEventListener('input', (event) => {
          state.query = event.target.value;
          renderCurriculum();
        });

        dom.editForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (!state.editMode) {
            showStatus(t('status.requireEditLecture'), 'info');
            return;
          }
          if (!state.selectedLectureId) {
            return;
          }
          const payload = {
            name: dom.editName.value.trim(),
            description: dom.editDescription.value.trim(),
          };
          const moduleValue = dom.editModule.value;
          if (moduleValue) {
            payload.module_id = Number(moduleValue);
          }
          if (!payload.name) {
            showStatus(t('status.lectureTitleRequired'), 'error');
            return;
          }
          try {
            await request(`/api/lectures/${state.selectedLectureId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            showStatus(t('status.lectureUpdated'), 'success');
            await refreshData();
            await selectLecture(state.selectedLectureId);
          } catch (error) {
            showStatus(error.message, 'error');
          }
        });

        dom.deleteButton.addEventListener('click', async () => {
          if (!state.selectedLectureId || !state.editMode) {
            return;
          }
          const lectureName = dom.editName.value.trim() || dom.editName.placeholder || '';
          const confirmed = await confirmDialog({
            title: t('dialogs.deleteLecture.title'),
            message: t('dialogs.deleteLecture.message', { context: lectureName }),
            confirmText: t('common.actions.delete'),
            cancelText: t('dialogs.deleteLecture.cancel'),
            variant: 'danger',
          });
          if (!confirmed) {
            return;
          }
          const secondCheck = await confirmDialog({
            title: t('dialogs.confirmDeletion.title'),
            message: t('dialogs.confirmDeletion.message'),
            confirmText: t('dialogs.confirmDeletion.confirm'),
            cancelText: t('dialog.cancel'),
            variant: 'danger',
          });
          if (!secondCheck) {
            return;
          }
          try {
            await request(`/api/lectures/${state.selectedLectureId}`, { method: 'DELETE' });
            showStatus(t('status.lectureRemoved'), 'success');
            state.selectedLectureId = null;
            clearDetailPanel();
            await refreshData();
          } catch (error) {
            showStatus(error.message, 'error');
          }
        });

        dom.createForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const moduleId = Number(dom.createModule.value);
          const name = dom.createName.value.trim();
          const description = dom.createDescription.value.trim();
          if (!moduleId || !name) {
            showStatus(t('status.createLectureRequirements'), 'error');
            return;
          }
          try {
            const payload = await request('/api/lectures', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ module_id: moduleId, name, description }),
            });
            dom.createForm.reset();
            showStatus(t('status.lectureCreated'), 'success');
            await refreshData();
            const newLectureId = payload?.lecture?.id;
            if (newLectureId) {
              await selectLecture(newLectureId);
            }
          } catch (error) {
            showStatus(error.message, 'error');
          }
        });

        async function handleTranscribeClick(event) {
          event?.preventDefault?.();
          if (!state.selectedLectureId) {
            return;
          }

          const lectureId = state.selectedLectureId;
          const selectedModel = getTranscribeModelValue();
          const button = getTranscribeButton();

          if (button) {
            button.disabled = true;
          }

          showStatus(t('status.transcriptionPreparing'), 'info', { persist: true });
          startTranscriptionProgress(lectureId);
          try {
            const payload = await request(`/api/lectures/${lectureId}/transcribe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: selectedModel }),
            });
            stopTranscriptionProgress();
            const fallbackModel = payload?.fallback_model;
            if (fallbackModel) {
              const fallbackReason =
                typeof payload?.fallback_reason === 'string'
                  ? payload.fallback_reason
                  : t('status.gpuNotAvailable');
              await showDialog({
                title: t('dialogs.gpuWhisper.title'),
                message: `${fallbackReason} ${t('status.gpuFallback', { model: fallbackModel })}`,
                confirmText: t('common.actions.ok'),
                cancelText: t('common.actions.close'),
                variant: 'danger',
              });
              setTranscribeModelValue(fallbackModel);
              if (dom.settingsWhisperModel) {
                dom.settingsWhisperModel.value = fallbackModel;
              }
              if (state.settings) {
                state.settings.whisper_model = fallbackModel;
                state.settings.whisper_model_requested = fallbackModel;
              }
              await loadGpuWhisperStatus();
            } else if (selectedModel === GPU_MODEL) {
              await loadGpuWhisperStatus();
            }
            showStatus(t('status.transcriptionCompleted'), 'success', { progressRatio: 1 });
            await refreshData();
            await selectLecture(lectureId);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            stopTranscriptionProgress();
            const progress = await fetchTranscriptionProgress(state.selectedLectureId);
            if (progress && progress.message) {
              showStatus(progress.message, progress.error ? 'error' : 'info', {
                progressRatio: progress.ratio,
                persist: !progress.finished,
              });
            } else {
              showStatus(message, 'error');
            }
          } finally {
            if (button) {
              button.disabled = false;
            }
          }
        }

        if (dom.settingsWhisperGpuTest) {
          dom.settingsWhisperGpuTest.addEventListener('click', async () => {
            if (state.gpuWhisper.unavailable) {
              return;
            }
            dom.settingsWhisperGpuTest.disabled = true;
            showStatus(t('status.gpuChecking'), 'info');
            try {
              const payload = await request('/api/settings/whisper-gpu/test', {
                method: 'POST',
              });
              const status = payload?.status || {};
              updateGpuWhisperUI(status);
              if (status.supported) {
                showStatus(t('status.gpuConfirmed'), 'success');
                if (state.settings?.whisper_model_requested === GPU_MODEL) {
                  if (dom.settingsWhisperModel) {
                    dom.settingsWhisperModel.value = GPU_MODEL;
                  }
                  setTranscribeModelValue(GPU_MODEL);
                  state.settings.whisper_model = GPU_MODEL;
                }
              } else {
                const failureMessage =
                  typeof status.message === 'string' && status.message
                    ? status.message
                    : t('status.gpuUnsupported');
                await showDialog({
                  title: t('dialogs.gpuWhisper.title'),
                  message: failureMessage,
                  confirmText: t('common.actions.ok'),
                  cancelText: t('common.actions.close'),
                  variant: 'danger',
                });
                showStatus(failureMessage, 'error');
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              showStatus(message, 'error');
            } finally {
              dom.settingsWhisperGpuTest.disabled = state.gpuWhisper.unavailable;
            }
          });
        }

        if (dom.settingsUpdateRun) {
          dom.settingsUpdateRun.addEventListener('click', () => {
            void triggerSystemUpdate();
          });
        }

        if (dom.settingsUpdateRefresh) {
          dom.settingsUpdateRefresh.addEventListener('click', async () => {
            if (dom.settingsUpdateRefresh.disabled) {
              return;
            }
            dom.settingsUpdateRefresh.disabled = true;
            try {
              await fetchSystemUpdateStatus();
            } finally {
              dom.settingsUpdateRefresh.disabled = state.systemUpdate.running;
            }
          });
        }

        if (dom.settingsExport) {
          dom.settingsExport.addEventListener('click', async () => {
            dom.settingsExport.disabled = true;
            showStatus(t('status.exporting'), 'info');
            try {
              const payload = await request('/api/settings/export', { method: 'POST' });
              const archive = payload?.archive;
              if (!archive || !archive.path) {
                throw new Error(t('status.exportFailed'));
              }
              const link = document.createElement('a');
              link.href = buildStorageURL(archive.path);
              link.download = archive.filename || 'lecture-tools-export.zip';
              document.body.appendChild(link);
              link.click();
              link.remove();
              showStatus(t('status.exportReady'), 'success');
            } catch (error) {
              showStatus(error.message, 'error');
            } finally {
              dom.settingsExport.disabled = false;
            }
          });
        }

        if (dom.settingsImport) {
          dom.settingsImport.addEventListener('click', async () => {
            if (dom.settingsImport.disabled) {
              return;
            }

            const dialogResult = await showUploadDialog({
              accept: '.zip',
              title: t('dialogs.upload.archiveTitle'),
              description: t('dialogs.upload.archiveDescription'),
              prompt: t('dialogs.upload.prompt'),
              help: t('dialogs.upload.help'),
              browseLabel: t('dialogs.upload.browse'),
              clearLabel: t('dialogs.upload.clear'),
              uploadLabel: t('dialogs.upload.action'),
              onUpload: async (file, helpers) => {
                const formData = new FormData();
                formData.append('file', file);
                if (dom.settingsImportMode) {
                  formData.append('mode', dom.settingsImportMode.value || 'merge');
                }
                dom.settingsImport.disabled = true;
                if (dom.settingsExport) {
                  dom.settingsExport.disabled = true;
                }
                showStatus(t('status.importing'), 'info');
                try {
                  const response = await uploadWithProgress('/api/settings/import', {
                    method: 'POST',
                    body: formData,
                    onProgress: (ratio) => {
                      helpers?.reportProgress?.(ratio);
                    },
                  });
                  return response;
                } finally {
                  dom.settingsImport.disabled = false;
                  if (dom.settingsExport) {
                    dom.settingsExport.disabled = false;
                  }
                }
              },
            });

            if (!dialogResult || !dialogResult.uploaded || !dialogResult.confirmed) {
              return;
            }

            try {
              const payload = dialogResult.result;
              const summary = payload?.import;
              if (summary) {
                const count = Number(summary.lectures || 0);
                if (count > 0) {
                  showStatus(t('status.importSuccess', { count }), 'success');
                } else {
                  showStatus(t('status.importNoChanges'), 'success');
                }
              } else {
                showStatus(t('status.importSuccess', { count: 0 }), 'success');
              }
              await refreshData();
            } catch (error) {
              showStatus(error instanceof Error ? error.message : String(error), 'error');
            }
          });
        }

        if (dom.settingsExitApp) {
          dom.settingsExitApp.addEventListener('click', async () => {
            const { confirmed } = await showDialog({
              title: t('dialogs.exitApp.title'),
              message: t('dialogs.exitApp.message'),
              confirmText: t('common.actions.exit'),
              cancelText: t('dialog.cancel'),
              variant: 'danger',
            });
            if (!confirmed) {
              return;
            }

            dom.settingsExitApp.disabled = true;
            showStatus(t('status.shuttingDown'), 'info');

            try {
              await request('/api/system/shutdown', { method: 'POST' });
              window.setTimeout(() => {
                try {
                  window.close();
                } catch (error) {
                  // Ignore inability to close the window.
                }
                try {
                  window.location.replace('about:blank');
                } catch (error) {
                  // Ignore navigation failures.
                }
              }, 300);
            } catch (error) {
              dom.settingsExitApp.disabled = false;
              const message = error instanceof Error ? error.message : String(error);
              showStatus(message, 'error');
            }
          });
        }

        if (dom.settingsLanguage) {
          dom.settingsLanguage.addEventListener('change', (event) => {
            const value = normalizeLanguage(event.target.value);
            applyTranslations(value);
            renderStorage();
            updateEditModeUI();
          });
        }

        if (dom.settingsForm) {
          dom.settingsForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const themeValue = dom.settingsTheme.value || 'system';
            const languageValue = normalizeLanguage(dom.settingsLanguage.value);
            const modelValue = normalizeWhisperModel(dom.settingsWhisperModel.value);
            const computeValue = dom.settingsWhisperCompute.value.trim() || 'int8';
            const beamValue = Math.max(
              1,
              Math.min(10, Number(dom.settingsWhisperBeam.value) || 5),
            );
            const dpiValue = Number(normalizeSlideDpi(dom.settingsSlideDpi.value));
            const masteringEnabled = dom.settingsAudioMastering
              ? Boolean(dom.settingsAudioMastering.checked)
              : true;
            const debugEnabled = dom.settingsDebugEnabled
              ? Boolean(dom.settingsDebugEnabled.checked)
              : false;

            try {
              const response = await request('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  theme: themeValue,
                  language: languageValue,
                  whisper_model: modelValue,
                  whisper_compute_type: computeValue,
                  whisper_beam_size: beamValue,
                  slide_dpi: dpiValue,
                  audio_mastering_enabled: masteringEnabled,
                  debug_enabled: debugEnabled,
                }),
              });
              const updatedSettings = response?.settings ?? {
                theme: themeValue,
                language: languageValue,
                whisper_model: modelValue,
                whisper_compute_type: computeValue,
                whisper_beam_size: beamValue,
                slide_dpi: dpiValue,
                audio_mastering_enabled: masteringEnabled,
                debug_enabled: debugEnabled,
              };
              syncSettingsForm(updatedSettings);
              if (modelValue === GPU_MODEL) {
                await loadGpuWhisperStatus();
              }
              showStatus(t('status.settingsSaved'), 'success');
            } catch (error) {
              showStatus(error.message, 'error');
            }
          });
        }
        window.addEventListener('beforeunload', () => {
          stopDebugPolling();
        });
        setActiveView(state.activeView);
        updateEditModeUI();
        clearDetailPanel();
        applyTheme('system');
        await loadGpuWhisperStatus();
        await loadSettings();
        await fetchSystemUpdateStatus();
        await refreshData();
      })();
