import { bootstrapEnvironment } from './environment';
import { Store } from './store';
import { CurriculumController } from './controllers/curriculum';
import { LectureDetailController } from './controllers/lecture-detail';
import { ProgressController } from './controllers/progress';
import { StorageController } from './controllers/storage';
import { SettingsController } from './controllers/settings';
import { qsa, qs, setActiveTab, switchView } from './utils/dom';

export class LectureToolsApp {
  private store = new Store();

  private curriculum: CurriculumController | null = null;

  private lectureDetail: LectureDetailController | null = null;

  private progress: ProgressController | null = null;

  private storage: StorageController | null = null;

  private settings: SettingsController | null = null;

  init(): void {
    bootstrapEnvironment();
    this.curriculum = new CurriculumController(this.store, qs<HTMLElement>(document, '.sidebar'));
    this.curriculum.init();

    this.lectureDetail = new LectureDetailController(this.store, document.body);
    this.lectureDetail.init();

    this.progress = new ProgressController(this.store, qs<HTMLElement>(document, '#view-progress'));
    this.progress.init();

    this.storage = new StorageController(this.store, qs<HTMLElement>(document, '#view-storage'));
    this.storage.init();

    this.settings = new SettingsController(this.store, qs<HTMLElement>(document, '#view-settings'));
    this.settings.init();

    this.setupViewNavigation();
  }

  private setupViewNavigation(): void {
    const buttons = qsa<HTMLButtonElement>(document, '.top-bar [data-view]');
    const views = qsa<HTMLElement>(document, '.view');
    let active = 'details';

    const updateView = (view: string) => {
      active = view;
      setActiveTab(buttons, view);
      switchView(views, view);
    };

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const view = button.dataset.view;
        if (view) {
          updateView(view);
        }
      });
    });

    updateView(active);
  }
}

export function startApp(): void {
  const app = new LectureToolsApp();
  app.init();
}
