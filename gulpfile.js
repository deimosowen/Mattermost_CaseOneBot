const gulp = require('gulp');
const bump = require('gulp-bump');
const fs = require('fs');
const path = require('path');

// Очистка dist перед сборкой
gulp.task('clean', function (done) {
    const distDir = path.join(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true, force: true });
    }
    done();
});

// Копирование файлов с правильными исключениями
gulp.task('copy', function () {
    return gulp.src([
        '**',
        '!.git/**',
        '!node_modules/**',
        '!dist/**',
        '!__tests__/**',
        '!tests/**',
        '!logs/**',
        '!.github/**',
        '!.cursor/**',
        '!**/*.db',
        '!jira/proxy/node_modules/**',
        '!credentials**',
        '!gulpfile.js',
        '!.env',
        '!**/.gitignore',
        '!package-lock.json',
        '!**/package-lock.json',
    ], { dot: true })
        .pipe(gulp.dest('dist'));
});

gulp.task('build', gulp.series('clean', 'copy'));

gulp.task('bump-patch', function () {
    return gulp.src('./package.json')
        .pipe(bump({ type: 'patch' }))
        .pipe(gulp.dest('./'));
});

gulp.task('bump-minor', function () {
    return gulp.src('./package.json')
        .pipe(bump({ type: 'minor' }))
        .pipe(gulp.dest('./'));
});

gulp.task('bump-major', function () {
    return gulp.src('./package.json')
        .pipe(bump({ type: 'major' }))
        .pipe(gulp.dest('./'));
});

gulp.task('release', gulp.series('bump-minor', 'build'));