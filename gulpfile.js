const gulp = require('gulp');
const bump = require('gulp-bump');

gulp.task('bump-version', function () {
    return gulp.src('./package.json')
        .pipe(bump({ type: 'minor' }))
        .pipe(gulp.dest('./'));
});

gulp.task('build', function () {
    return gulp.src([
        '**',
        '!.git/**',
        '!node_modules/**',
        '!dist/**',
        '!tests/**',
        '!logs/**',
        '!.github/**',
        '!db/**/*.db',
        '!jira/proxy/node_modules/**',
        '!credentials**',
        '!gulpfile.js',
        '!.env',
        '!**/.gitignore'
    ], { dot: true })
        .pipe(gulp.dest('dist'));
});

gulp.task('release', gulp.series('bump-version', 'build'));