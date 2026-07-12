# 임시 파일 정리 스크립트
# 실행: ! .\cleanup-temp.ps1
# 또는 PowerShell 터미널에서: .\cleanup-temp.ps1

$targets = @(
    "infra\temp-render-taskdef.json",
    "infra\temp-ssm-policy.json",
    "infra\temp-subtitle-taskdef.json",
    "supabase-signup",
    "apps\api\.esbuild"
)

foreach ($target in $targets) {
    if (Test-Path $target) {
        Remove-Item -Recurse -Force $target
        Write-Host "삭제 완료: $target"
    } else {
        Write-Host "없음 (이미 삭제됨): $target"
    }
}

Write-Host ""
Write-Host "정리 완료."
