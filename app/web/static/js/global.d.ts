declare global {
  interface Window {
    __LECTURE_TOOLS_SERVER_ROOT_PATH__?: string | null;
    __LECTURE_TOOLS_BASE_PATH__?: string | null;
    __LECTURE_TOOLS_PDFJS_SCRIPT_URL__?: string | null;
    __LECTURE_TOOLS_PDFJS_WORKER_URL__?: string | null;
    __LECTURE_TOOLS_PDFJS_MODULE_URL__?: string | null;
    __LECTURE_TOOLS_PDFJS_WORKER_MODULE_URL__?: string | null;
  }
}

export {};
