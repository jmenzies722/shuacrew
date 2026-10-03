export function learningProgress<Course extends { lessons: Array<{ done: boolean }> }>(courses: Course[]) {
  const activeCourses = courses.filter((course) => course.lessons.some((lesson) => !lesson.done));
  const course = activeCourses[0];
  return {
    course,
    lessonIndex: course?.lessons.findIndex((lesson) => !lesson.done) ?? -1,
    completed: courses.reduce((count, item) => count + item.lessons.filter((lesson) => lesson.done).length, 0),
    total: courses.reduce((count, item) => count + item.lessons.length, 0),
    active: activeCourses.length,
  };
}
