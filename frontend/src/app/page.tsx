import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            コードレビューツール
          </h1>
          <p className="mt-4 text-xl text-gray-500">
            新入社員のプログラミング学習を促進するためのAI活用コードレビューツール
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link 
            href="/login" 
            className="py-3 px-6 bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 text-center"
          >
            ログイン
          </Link>
          <Link 
            href="/register" 
            className="py-3 px-6 bg-secondary text-secondary-foreground rounded-md shadow hover:bg-secondary/90 text-center"
          >
            新規登録
          </Link>
        </div>
        
        <div className="mt-16 border-t pt-8 text-center text-gray-500">
          <p>開発中のプロジェクトです</p>
        </div>
      </div>
    </div>
  );
}