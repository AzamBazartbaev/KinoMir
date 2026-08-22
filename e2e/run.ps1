$ErrorActionPreference = "Stop"
$compose = @("compose", "-f", "docker-compose.e2e.yml")

try {
    & docker @compose up --build --abort-on-container-exit --exit-code-from e2e
    if ($LASTEXITCODE -ne 0) { throw "E2E tests failed with exit code $LASTEXITCODE" }
}
finally {
    & docker @compose down --volumes --remove-orphans
}
