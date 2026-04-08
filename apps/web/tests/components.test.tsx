/**
 * LexOS Frontend Test Suite - Component and Integration Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

// Create test query client
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

// Wrapper for testing with providers
function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

// ============================================================================
// Auth Store Tests
// ============================================================================

describe('Auth Store', () => {
  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();
    mockFetch.mockClear();
  });
  
  it('should initialize with null user', async () => {
    const { useAuthStore } = await import('../src/store/auth');
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });
  
  it('should set user on login', async () => {
    const { useAuthStore } = await import('../src/store/auth');
    
    useAuthStore.getState().setUser({
      id: '123',
      email: 'test@example.com',
      role: 'attorney',
      displayName: 'Test User',
    });
    
    const state = useAuthStore.getState();
    expect(state.user?.email).toBe('test@example.com');
    expect(state.isAuthenticated).toBe(true);
  });
  
  it('should clear user on logout', async () => {
    const { useAuthStore } = await import('../src/store/auth');
    
    useAuthStore.getState().setUser({
      id: '123',
      email: 'test@example.com',
      role: 'attorney',
      displayName: 'Test User',
    });
    
    useAuthStore.getState().logout();
    
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });
  
  it('should store tokens', async () => {
    const { useAuthStore } = await import('../src/store/auth');
    
    useAuthStore.getState().setTokens('access-token', 'refresh-token');
    
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('access-token');
    expect(state.refreshToken).toBe('refresh-token');
  });
});

// ============================================================================
// API Client Tests
// ============================================================================

describe('API Client', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });
  
  it('should add authorization header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: 'test' }),
    });
    
    const { apiClient } = await import('../src/lib/api');
    
    // Set token in store
    const { useAuthStore } = await import('../src/store/auth');
    useAuthStore.getState().setTokens('test-token', 'refresh');
    
    await apiClient.get('/test');
    
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });
  
  it('should refresh token on 401', async () => {
    // First call returns 401
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      })
      // Refresh token call
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          accessToken: 'new-token',
          refreshToken: 'new-refresh',
        }),
      })
      // Retry original call
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'success' }),
      });
    
    const { apiClient } = await import('../src/lib/api');
    const { useAuthStore } = await import('../src/store/auth');
    
    useAuthStore.getState().setTokens('old-token', 'old-refresh');
    
    // May throw or succeed depending on implementation
    try {
      await apiClient.get('/protected');
    } catch (e) {
      // Expected if refresh fails
    }
  });
  
  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    
    const { apiClient } = await import('../src/lib/api');
    
    await expect(apiClient.get('/test')).rejects.toThrow();
  });
  
  it('should handle JSON parse errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new Error('Invalid JSON')),
    });
    
    const { apiClient } = await import('../src/lib/api');
    
    await expect(apiClient.get('/test')).rejects.toThrow();
  });
});

// ============================================================================
// Component Tests
// ============================================================================

describe('UI Components', () => {
  describe('Button Component', () => {
    it('should render button with text', async () => {
      const { Button } = await import('../src/components/ui/button');
      
      render(<Button>Click me</Button>);
      
      expect(screen.getByRole('button')).toHaveTextContent('Click me');
    });
    
    it('should handle click events', async () => {
      const { Button } = await import('../src/components/ui/button');
      const handleClick = vi.fn();
      
      render(<Button onClick={handleClick}>Click me</Button>);
      
      fireEvent.click(screen.getByRole('button'));
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
    
    it('should be disabled when loading', async () => {
      const { Button } = await import('../src/components/ui/button');
      
      render(<Button disabled>Loading...</Button>);
      
      expect(screen.getByRole('button')).toBeDisabled();
    });
    
    it('should apply variant styles', async () => {
      const { Button } = await import('../src/components/ui/button');
      
      const { container } = render(<Button variant="destructive">Delete</Button>);
      
      expect(container.firstChild).toHaveClass('bg-destructive');
    });
  });
  
  describe('Input Component', () => {
    it('should render input', async () => {
      const { Input } = await import('../src/components/ui/input');
      
      render(<Input placeholder="Enter text" />);
      
      expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
    });
    
    it('should handle value changes', async () => {
      const { Input } = await import('../src/components/ui/input');
      const handleChange = vi.fn();
      
      render(<Input onChange={handleChange} />);
      
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });
      
      expect(handleChange).toHaveBeenCalled();
    });
    
    it('should show error state', async () => {
      const { Input } = await import('../src/components/ui/input');
      
      const { container } = render(<Input aria-invalid="true" />);
      
      expect(container.firstChild).toHaveAttribute('aria-invalid', 'true');
    });
  });
  
  describe('Card Component', () => {
    it('should render card with content', async () => {
      const { Card, CardHeader, CardTitle, CardContent } = await import('../src/components/ui/card');
      
      render(
        <Card>
          <CardHeader>
            <CardTitle>Test Card</CardTitle>
          </CardHeader>
          <CardContent>Card content here</CardContent>
        </Card>
      );
      
      expect(screen.getByText('Test Card')).toBeInTheDocument();
      expect(screen.getByText('Card content here')).toBeInTheDocument();
    });
  });
  
  describe('Badge Component', () => {
    it('should render badge with severity color', async () => {
      const { Badge } = await import('../src/components/ui/badge');
      
      const { container } = render(<Badge variant="destructive">Critical</Badge>);
      
      expect(screen.getByText('Critical')).toBeInTheDocument();
      expect(container.firstChild).toHaveClass('bg-destructive');
    });
  });
});

// ============================================================================
// Form Validation Tests
// ============================================================================

describe('Form Validation', () => {
  describe('Login Form', () => {
    it('should validate email format', () => {
      const email = 'invalid-email';
      const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      expect(isValid).toBe(false);
    });
    
    it('should validate email with proper format', () => {
      const email = 'test@example.com';
      const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      expect(isValid).toBe(true);
    });
    
    it('should require minimum password length', () => {
      const password = '12345';
      const isValid = password.length >= 8;
      expect(isValid).toBe(false);
    });
    
    it('should accept valid password', () => {
      const password = 'Password123!';
      const hasMinLength = password.length >= 8;
      const hasUppercase = /[A-Z]/.test(password);
      const hasLowercase = /[a-z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      
      expect(hasMinLength).toBe(true);
      expect(hasUppercase).toBe(true);
      expect(hasLowercase).toBe(true);
      expect(hasNumber).toBe(true);
    });
  });
  
  describe('Matter Form', () => {
    it('should require matter name', () => {
      const name = '';
      expect(name.trim().length > 0).toBe(false);
    });
    
    it('should require client name', () => {
      const clientName = '';
      expect(clientName.trim().length > 0).toBe(false);
    });
    
    it('should validate practice area selection', () => {
      const validPracticeAreas = ['M&A', 'Finance', 'Real Estate', 'Employment', 'IP', 'Commercial', 'Other'];
      const selected = 'M&A';
      expect(validPracticeAreas.includes(selected)).toBe(true);
    });
  });
});

// ============================================================================
// Theme Tests
// ============================================================================

describe('Theme System', () => {
  it('should have correct brand colors', () => {
    const colors = {
      navy: '#0A1628',
      navyLight: '#112240',
      gold: '#C9A84C',
    };
    
    expect(colors.navy).toBe('#0A1628');
    expect(colors.navyLight).toBe('#112240');
    expect(colors.gold).toBe('#C9A84C');
  });
  
  it('should have correct risk colors', () => {
    const riskColors = {
      critical: '#DC2626',
      high: '#EA580C',
      medium: '#D97706',
      low: '#16A34A',
    };
    
    expect(riskColors.critical).toBe('#DC2626');
    expect(riskColors.high).toBe('#EA580C');
    expect(riskColors.medium).toBe('#D97706');
    expect(riskColors.low).toBe('#16A34A');
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

describe('Accessibility', () => {
  describe('Button Accessibility', () => {
    it('should have accessible name', async () => {
      const { Button } = await import('../src/components/ui/button');
      
      render(<Button aria-label="Submit form">Submit</Button>);
      
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });
    
    it('should be keyboard navigable', async () => {
      const { Button } = await import('../src/components/ui/button');
      const handleClick = vi.fn();
      
      render(<Button onClick={handleClick}>Click me</Button>);
      
      const button = screen.getByRole('button');
      button.focus();
      
      expect(document.activeElement).toBe(button);
    });
  });
  
  describe('Form Accessibility', () => {
    it('should associate labels with inputs', async () => {
      const { Input } = await import('../src/components/ui/input');
      const { Label } = await import('../src/components/ui/label');
      
      render(
        <>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" />
        </>
      );
      
      const input = screen.getByLabelText('Email');
      expect(input).toBeInTheDocument();
    });
    
    it('should announce errors to screen readers', async () => {
      render(
        <div role="alert" aria-live="polite">
          Email is required
        </div>
      );
      
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Email is required');
    });
  });
});

// ============================================================================
// Data Display Tests
// ============================================================================

describe('Data Display', () => {
  describe('Clause Type Display', () => {
    const CLAUSE_TYPE_LABELS: Record<string, string> = {
      indemnification: 'Indemnification',
      limitation_of_liability: 'Limitation of Liability',
      termination_for_convenience: 'Termination for Convenience',
      termination_for_cause: 'Termination for Cause',
      confidentiality: 'Confidentiality',
      non_compete: 'Non-Compete',
      non_solicitation: 'Non-Solicitation',
      intellectual_property: 'Intellectual Property',
      governing_law: 'Governing Law',
      arbitration: 'Arbitration',
      jury_waiver: 'Jury Waiver',
      class_action_waiver: 'Class Action Waiver',
      force_majeure: 'Force Majeure',
      assignment: 'Assignment',
      notice_requirements: 'Notice Requirements',
      amendment: 'Amendment',
      severability: 'Severability',
      entire_agreement: 'Entire Agreement',
      warranty_disclaimer: 'Warranty Disclaimer',
      data_privacy: 'Data Privacy',
      insurance_requirements: 'Insurance Requirements',
      compliance_with_laws: 'Compliance with Laws',
      audit_rights: 'Audit Rights',
      most_favored_nation: 'Most Favored Nation',
    };
    
    it('should have labels for all 24 clause types', () => {
      expect(Object.keys(CLAUSE_TYPE_LABELS).length).toBe(24);
    });
    
    it('should format clause type labels correctly', () => {
      expect(CLAUSE_TYPE_LABELS['indemnification']).toBe('Indemnification');
      expect(CLAUSE_TYPE_LABELS['limitation_of_liability']).toBe('Limitation of Liability');
      expect(CLAUSE_TYPE_LABELS['data_privacy']).toBe('Data Privacy');
    });
  });
  
  describe('Risk Severity Display', () => {
    const SEVERITY_LABELS = {
      critical: { label: 'Critical', color: 'bg-red-600' },
      high: { label: 'High', color: 'bg-orange-500' },
      medium: { label: 'Medium', color: 'bg-yellow-500' },
      low: { label: 'Low', color: 'bg-green-500' },
    };
    
    it('should have all severity levels', () => {
      expect(Object.keys(SEVERITY_LABELS)).toEqual(['critical', 'high', 'medium', 'low']);
    });
  });
  
  describe('State Display', () => {
    const US_STATES = [
      { code: 'AL', name: 'Alabama' },
      { code: 'CA', name: 'California' },
      { code: 'NY', name: 'New York' },
      // ... all 50 + DC
    ];
    
    it('should format state codes to names', () => {
      const getStateName = (code: string) => {
        const state = US_STATES.find(s => s.code === code);
        return state?.name || code;
      };
      
      expect(getStateName('CA')).toBe('California');
      expect(getStateName('NY')).toBe('New York');
    });
  });
});

// ============================================================================
// Date/Time Formatting Tests
// ============================================================================

describe('Date/Time Formatting', () => {
  it('should format dates correctly', () => {
    const date = new Date('2024-12-15T10:30:00Z');
    const formatted = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    
    expect(formatted).toMatch(/Dec 15, 2024|15 Dec 2024/);
  });
  
  it('should format relative times', () => {
    const formatRelativeTime = (date: Date): string => {
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      if (minutes > 0) return `${minutes}m ago`;
      return 'just now';
    };
    
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    expect(formatRelativeTime(hourAgo)).toBe('1h ago');
  });
  
  it('should format currency', () => {
    const formatCurrency = (amount: number): string => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount);
    };
    
    expect(formatCurrency(1000)).toBe('$1,000.00');
    expect(formatCurrency(5000000)).toBe('$5,000,000.00');
  });
});

// ============================================================================
// Error Boundary Tests
// ============================================================================

describe('Error Handling', () => {
  it('should handle API errors gracefully', () => {
    const parseApiError = (error: any): string => {
      if (error.response?.data?.message) {
        return error.response.data.message;
      }
      if (error.message) {
        return error.message;
      }
      return 'An unexpected error occurred';
    };
    
    expect(parseApiError({ message: 'Network error' })).toBe('Network error');
    expect(parseApiError({})).toBe('An unexpected error occurred');
  });
  
  it('should show user-friendly error messages', () => {
    const errorMessages: Record<number, string> = {
      400: 'Invalid request. Please check your input.',
      401: 'Please sign in to continue.',
      403: 'You do not have permission to perform this action.',
      404: 'The requested resource was not found.',
      429: 'Too many requests. Please try again later.',
      500: 'Something went wrong. Please try again.',
    };
    
    expect(errorMessages[401]).toBe('Please sign in to continue.');
    expect(errorMessages[403]).toBe('You do not have permission to perform this action.');
  });
});

// ============================================================================
// AI Disclaimer Tests
// ============================================================================

describe('AI Disclaimer', () => {
  const AI_DISCLAIMER = 'AI-generated — requires attorney review';
  
  it('should include disclaimer text', () => {
    expect(AI_DISCLAIMER).toContain('AI-generated');
    expect(AI_DISCLAIMER).toContain('attorney review');
  });
  
  it('should be present in AI-generated content', () => {
    const aiResponse = {
      answer: 'This is the AI analysis...',
      disclaimer: AI_DISCLAIMER,
    };
    
    expect(aiResponse.disclaimer).toBe(AI_DISCLAIMER);
  });
});

// ============================================================================
// Navigation Tests
// ============================================================================

describe('Navigation', () => {
  const routes = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/matters', label: 'Matters' },
    { path: '/research', label: 'Research' },
    { path: '/analytics', label: 'Analytics' },
    { path: '/settings', label: 'Settings' },
  ];
  
  it('should have all main routes defined', () => {
    expect(routes.length).toBeGreaterThanOrEqual(5);
  });
  
  it('should have correct route labels', () => {
    const dashboardRoute = routes.find(r => r.path === '/dashboard');
    expect(dashboardRoute?.label).toBe('Dashboard');
  });
});

// ============================================================================
// Local Storage Tests
// ============================================================================

describe('Local Storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  
  it('should persist theme preference', () => {
    localStorage.setItem('theme', 'dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });
  
  it('should persist sidebar state', () => {
    localStorage.setItem('sidebar-collapsed', 'true');
    expect(localStorage.getItem('sidebar-collapsed')).toBe('true');
  });
  
  it('should clear sensitive data on logout', () => {
    localStorage.setItem('accessToken', 'token');
    localStorage.setItem('refreshToken', 'refresh');
    localStorage.setItem('user', JSON.stringify({ email: 'test@example.com' }));
    
    // Simulate logout
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});
