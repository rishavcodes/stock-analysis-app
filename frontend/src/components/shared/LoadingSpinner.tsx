export default function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' };
  return (
    <div className="flex items-center justify-center p-4">
      <div
        className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-gray-600 border-t-blue-500`}
      />
    </div>
  );
}
