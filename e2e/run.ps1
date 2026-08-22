$ErrorActionPreference = "Stop"
$compose = @("compose", "-f", "docker-compose.e2e.yml")

try {
    & docker @compose up --build --abort-on-container-exit --exit-code-from e2e
    if ($LASTEXITCODE -ne 0) { throw "E2E tests failed with exit code $LASTEXITCODE" }

    $e2eContainer = & docker @compose ps -a e2e --format json | ConvertFrom-Json
    if ($e2eContainer.State -ne "exited" -or $e2eContainer.ExitCode -ne 0) {
        throw "E2E container did not finish successfully"
    }
}
finally {
    & docker @compose down --volumes --remove-orphans
}
