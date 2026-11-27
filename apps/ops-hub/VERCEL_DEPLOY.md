# KOMKED 팀 운영 공간 Vercel 배포

KOMKED 팀의 `komked-team-ops-hub` 프로젝트에서 배포합니다. 운영 도메인은 `https://komked-team-ops-hub.vercel.app`입니다. 기존 Sites 배포는 별도 주소에서 계속 사용할 수 있습니다.

## GitHub 자동 배포 연결

애플리케이션은 `apps/ops-hub`에 있습니다. 기술 제안과 요구사항 문서는 저장소 루트에서 관리합니다.

1. KOMKED GitHub 저장소에 앱 소스를 올리고, Vercel GitHub 앱에 해당 저장소의 접근을 허용합니다.
2. 기존 Vercel 프로젝트의 **Settings → Build and Deployment**에서 **Root Directory**를 `apps/ops-hub`로 설정합니다. 빌드 명령과 출력 폴더는 앱의 `vercel.json`에서 지정합니다.
3. **Settings → Git**에서 저장소를 연결하고 운영 브랜치를 `main`으로 지정합니다. `main`의 변경은 운영 배포를 시작하고, 다른 브랜치에서는 프리뷰 배포를 확인할 수 있습니다.
4. 첫 Git 배포에서 빌드 로그와 커밋 SHA를 확인합니다. 운영 연동 설정을 완료한 뒤 실제 팀 계정으로 핵심 기능을 확인합니다.

## 계정과 데이터 연결

Vercel 프로젝트의 **Settings → Environment Variables**에서 **Production**에 `.env.vercel.example`의 항목을 등록합니다. OAuth 비밀키, 세션 서명 키, 서비스 계정 JSON, 원본 스프레드시트 ID, Cloudflare 토큰과 액세스 키는 Sensitive로 설정합니다.

1. Google Cloud에서 웹 애플리케이션 OAuth 클라이언트를 만들고 `https://komked-team-ops-hub.vercel.app/oauth/return`을 승인된 리디렉션 URI로 등록합니다. 클라이언트 ID와 비밀키를 등록합니다.
2. `KOMKED_ALLOWED_EMAILS`에는 로그인할 팀원 이메일을 쉼표로 구분해 등록합니다. 관리자 한 명을 정해 목록과 `SITE_LAYOUT_ADMIN_EMAIL`에 같은 주소를 등록합니다. Google OAuth 앱이 테스트 상태이면 해당 Google 계정도 테스트 사용자로 등록합니다.
3. Google Sheets API와 Drive API를 사용 설정합니다. 일정과 채널 지표 원본은 서비스 계정에 뷰어로 공유하고, 영수증 기록 시트와 영수증 폴더는 편집자로 공유합니다. 서비스 계정 키 JSON을 등록하고, 문서 주소에서 `/d/` 뒤의 ID를 각각 `GOOGLE_CALENDAR_SPREADSHEET_ID`, `GOOGLE_CHANNELS_SPREADSHEET_ID`, `GOOGLE_RECEIPTS_SPREADSHEET_ID`에 등록합니다. 영수증 폴더의 ID는 `GOOGLE_RECEIPTS_FOLDER_ID`에 등록합니다.
4. Cloudflare D1과 비공개 R2 버킷을 지정합니다. D1 토큰에는 쿼리에 필요한 권한을, R2 키에는 대상 버킷의 객체 읽기·쓰기 권한을 부여합니다. 빈 D1을 쓸 경우 `drizzle/` 폴더의 SQL을 번호 순으로 적용합니다.
5. 기존 데이터를 옮기는 경우에는 승인된 원본에서 D1 행과 R2 객체 키를 함께 이전합니다. 영수증 소유권을 유지하려면 확인된 팀원 이메일과 이전 Sites 내부 사용자 ID를 `KOMKED_LEGACY_OWNER_MAP`에 JSON 객체로 등록하고 담당 계정별 접근을 확인합니다.

업무 목록처럼 Sites에서 브라우저 로컬 저장소를 사용하던 정보는 도메인이 바뀌면 이전 사이트에서만 볼 수 있습니다. Vercel에서는 함수 요청 한도를 고려해 영수증 사진 한 장당 최대 4 MiB를 받습니다.

## 빌드와 확인

```sh
npm ci
npm run build -- --vercel
```

운영 변수 변경 후 Vercel에서 새로 배포합니다. `/api/health`의 `configured`는 환경변수 검사를 통과한 상태입니다. 제공업체 권한은 허용된 계정으로 로그인해 일정과 지표를 읽고 테스트 영수증의 등록·열람과 메시지·댓글 저장을 실행해 확인합니다. 다른 팀원 계정으로는 해당 영수증을 열 수 없어야 합니다. 설정이 필요한 동안에는 로그인 및 데이터 API를 잠급니다.
