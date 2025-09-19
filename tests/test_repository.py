from __future__ import annotations

from app.config import AppConfig
from app.services.storage import LectureRepository


def test_repository_crud_cycle(temp_config: AppConfig) -> None:
    repository = LectureRepository(temp_config)

    class_id = repository.add_class("Physics", "Introductory course")
    module_id = repository.add_module(class_id, "Classical Mechanics")
    lecture_id = repository.add_lecture(
        module_id,
        "Newton's Laws",
        description="Overview of Newtonian mechanics",
        audio_path="raw/audio.mp3",
        slide_path="raw/slides.pdf",
        notes_path="processed/notes.docx",
    )

    retrieved_lecture = repository.get_lecture(lecture_id)
    assert retrieved_lecture is not None
    assert retrieved_lecture.name == "Newton's Laws"
    assert retrieved_lecture.audio_path == "raw/audio.mp3"
    assert retrieved_lecture.notes_path == "processed/notes.docx"

    modules = list(repository.iter_modules(class_id))
    assert len(modules) == 1
    assert modules[0].name == "Classical Mechanics"

    repository.remove_lecture(lecture_id)
    assert repository.get_lecture(lecture_id) is None

    repository.remove_module(module_id)
    assert not list(repository.iter_modules(class_id))

    repository.remove_class(class_id)
    assert repository.get_class(class_id) is None


def test_repository_lookup_helpers(temp_config: AppConfig) -> None:
    repository = LectureRepository(temp_config)

    class_id = repository.add_class("Mathematics")
    module_id = repository.add_module(class_id, "Calculus")
    lecture_id = repository.add_lecture(module_id, "Derivatives")

    class_record = repository.find_class_by_name("Mathematics")
    module_record = repository.find_module_by_name(class_id, "Calculus")
    lecture_record = repository.find_lecture_by_name(module_id, "Derivatives")

    assert class_record is not None and class_record.id == class_id
    assert module_record is not None and module_record.id == module_id
    assert lecture_record is not None and lecture_record.id == lecture_id

    repository.update_lecture_description(lecture_id, "Differential calculus")
    repository.update_lecture_assets(
        lecture_id,
        audio_path="raw/derivatives.mp3",
        slide_path="raw/derivatives.pdf",
        transcript_path="processed/transcript.txt",
        notes_path="processed/notes.docx",
        slide_image_dir="processed/slides",
    )

    lecture = repository.get_lecture(lecture_id)
    assert lecture is not None
    assert lecture.description == "Differential calculus"
    assert lecture.audio_path == "raw/derivatives.mp3"
    assert lecture.slide_image_dir == "processed/slides"
    assert lecture.notes_path == "processed/notes.docx"
