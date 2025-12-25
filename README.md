# shrillecho playlist archive

- Architected distributed web crawling system using Go microservices and Redis queues, enabling parallel Spotify API processing
- Implemented real-time updates using WebSocket protocol and event-driven architecture for live crawl status
- Designed CI/CD pipeline using GitHub Actions, Docker, and Terraform for automated deployment to Digital Ocean
- Built responsive Next.js frontend with Supabase authentication and PostgreSQL database integration

### System

- The App is comprised of various components
  - **Frontend** - Next.JS 
  - **Database** - Supabase (PostgreSQL)
  - **Auth** - Supabase
  - **Caching / Queues** - Redis
  - **Backend** - Go
- The core component is the ability to scrape spotify using a distributed architecture of worker nodes that communicate via Redis.
  1. The user inputs a *seed* and a specified *depth* and then the API will crawl the spotify API from that point and retrieve data similar to the seed. For example this would be some *artist* and *depth* and it uses the related artists API to collect a pool of artists.
  2. To enable this scrape we simply utilise a queueing system via Redis, where the user submits a request to `/api/scrape` and this pushes a scrape task to the backend workers.
  3. The workers which are little Golang image can be deployed in various places and can read this global queue to process the scrape and then return the response to the user.
  4. The main backend app will be listening to the workers response and will write the results to Supabase & submit a Websocket response to the frontend to signal the operation was complete.

```mermaid
flowchart TD
    Next[Next.js]
    DB[(Database)]
    Redis[(Redis)]:::redis
    Spotify((Spotify)):::spotify
    Go1[Go Service 1]:::go
    Go2[Go Service 2]:::go
    Go3[Go Service 3]:::go
    GoMain[Go Main Service]:::go
    Auth[Authentication]:::auth

    Auth --> Next
    Next --> GoMain
    GoMain --> DB
    DB --> Auth
    
    GoMain --> Redis
    Redis --> GoMain
    
    Redis --> Go1
    Redis --> Go2
    Redis --> Go3
    
    Go1 --> Spotify
    Go2 --> Spotify
    Go3 --> Spotify

    Next -.->|Websocket Scrape Response| GoMain
    GoMain -.->|Receive Scrape Responses| Redis
    GoMain -.->|Post Scrapes| Redis

    classDef default fill:#fff,stroke:#333
    classDef go fill:#7FD4E4,stroke:#333,color:#000
    classDef auth fill:#50FA7B,stroke:#333,color:#000
    classDef redis fill:#D42A2A,stroke:#333,color:#fff
    classDef spotify fill:#1DB954,stroke:#333,color:#fff
```



### Devops

- Hosting: VPS
- Infrastructure: Terraform
- Terraform state: AWS S3
- Pipeline: Github Actions


1. `backend` builds and deploys an image to the Github registry
2. `frontend` builds and deploys an image to the Github registry
3. `infra` setups digital ocean VPS using terraform. It will SSH into this and setup Docker, SSH, clone the repo and start docker compose. It will use watchtower to poll for `frontend` and `backend` images as they are released.

```mermaid
flowchart TD
    %% Styling
    classDef infrastructure fill:#f96,stroke:#333,color:#000
    classDef backend fill:#9cf,stroke:#333,color:#000
    classDef frontend fill:#9f9,stroke:#333,color:#000
    classDef deploy fill:#f9f,stroke:#333,color:#000
    classDef storage fill:#fc9,stroke:#333,color:#000
    classDef container fill:#c9f,stroke:#333,color:#000
    classDef nginx fill:#ff9,stroke:#333,color:#000
    classDef watchtower fill:#f99,stroke:#333,color:#fff

    %% Infrastructure Pipeline
    subgraph infra[Infrastructure Pipeline]
        direction TB
        A[Create State Bucket]:::infrastructure
        B[Terraform Init/Plan/Apply]:::infrastructure
        C[Configure VPS]:::infrastructure
        D[Setup SSL & ENV]:::infrastructure
        E[Deploy Compose Stack]:::infrastructure
        A --> B --> C --> D --> E
    end

    %% Backend Pipeline
    subgraph backend[Backend Pipeline]
        direction TB
        F[Setup Go]:::backend
        G[Build Binary]:::backend
        H[Build Docker Image]:::backend
        I[Push to GHCR]:::backend
        F --> G --> H --> I
    end

    %% Frontend Pipeline
    subgraph frontend[Frontend Pipeline]
        direction TB
        J[Setup Node]:::frontend
        K[Install Dependencies]:::frontend
        L[Build Docker Image]:::frontend
        M[Push to GHCR]:::frontend
        J --> K --> L --> M
    end

    %% Deployed Services
    subgraph deployed[Deployed Stack]
        direction TB
        R[Redis:7-alpine]:::container
        BE[Backend Service<br>:8000]:::container
        FE[Frontend Service<br>:3000]:::container
        NG[Nginx<br>:80,:443]:::nginx
        WT[Watchtower]:::watchtower
        
        R <--> BE
        BE <--> FE
        FE <--> NG
        BE <--> NG
        WT --> BE
        WT --> FE
    end

    %% External Services
    S3[(AWS S3)]:::storage
    GHCR[(GitHub Container Registry)]:::storage
    VPS[Digital Ocean VPS]:::deploy

    %% Connections
    A --> S3
    B --> VPS
    I --> GHCR
    M --> GHCR
    GHCR --> WT
    E --> deployed
```

