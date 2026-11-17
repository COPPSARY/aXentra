# aXentra - IT Asset Inventory Management System

## Project Objective

aXentra is a comprehensive web-based IT Asset Inventory Management System designed to streamline the tracking, management, and lifecycle of IT assets within an organization. The system provides a centralized platform for managing physical IT assets, including computers, peripherals, and other equipment, with features for barcode scanning, asset categorization, location-based tracking, and loan management.

### Key Features

- **Asset Management**: Create, view, and manage IT assets with detailed information and categorization
- **Barcode Scanning**: Quick asset identification and tracking using barcode scanning capabilities
- **Location-Based Tracking**: Organize and track assets by their physical location within the organization
- **Asset Lending System**: Manage asset loans and track which assets are in use and when they will be returned
- **Dashboard Analytics**: Visual overview of asset distribution, upcoming returns, expiring items, and recent activities
- **User Management**: Role-based access control with Super Admin privileges
- **Authentication & Authorization**: Secure login system with token-based authentication
- **Multi-location Support**: Support for multiple organizational locations with context-aware asset filtering

## Technology Stack

- **Frontend**: Angular 19+ (standalone components)
- **Build Tool**: Angular CLI
- **Testing**: Karma & Jasmine
- **Styling**: CSS
- **Authentication**: Token-based (JWT)

## Development Setup

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn package manager

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

### Development Server

Start the local development server:

```bash
npm start
```

Navigate to `http://localhost:4200/` in your browser. The application will automatically reload whenever you modify source files.

### Code Scaffolding

Generate new components using Angular CLI:

```bash
ng generate component component-name
```

For a complete list of available schematics, run:

```bash
ng generate --help
```

### Building

Build the project for production:

```bash
ng build
```

Build artifacts are stored in the `dist/` directory with optimization for performance.

### Running Tests

Execute unit tests with Karma:

```bash
npm test
```

For end-to-end testing:

```bash
ng e2e
```

## Project Structure

```
src/
├── app/
│   ├── core/                 # Core services (auth, location)
│   ├── features/             # Feature modules
│   │   ├── assets/          # Asset management
│   │   ├── auth/            # Authentication pages
│   │   ├── dashboard/       # Dashboard analytics
│   │   ├── location/        # Location selection
│   │   ├── profile/         # User profile
│   │   └── users/           # User management
│   ├── shared/              # Shared components and services
│   └── app.routes.ts        # Application routing
├── environments/            # Environment configuration
└── main.ts                  # Application entry point
```

## Configuration

Environment-specific settings are managed in:

- `src/environments/environment.ts` - Production
- `src/environments/environment.development.ts` - Development

## API Integration

The application communicates with a backend API for:

- Authentication (`/api/auth`)
- Asset management
- User management
- Location data

## Additional Resources

- [Angular Documentation](https://angular.dev)
- [Angular CLI Overview](https://angular.dev/tools/cli)
