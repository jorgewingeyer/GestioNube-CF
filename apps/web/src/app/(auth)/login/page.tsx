import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardDescription,
} from "@repo/ui/components/card";
import { LoginForm } from "./components/login-form";
import Link from "next/link";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  return (
    <Card className=" w-full max-w-md">
      <CardHeader className="text-center space-y-2">
        <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
          <LogIn className="h-5 w-5 text-primary" />
        </div>
        <CardTitle className="text-2xl font-bold">
          ¡Bienvenido de nuevo!
        </CardTitle>
        <CardDescription className="text-base">
          Ingresa tus credenciales para acceder a tu panel de control.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
      <CardFooter className="flex justify-center">
        <p className="text-sm text-muted-foreground">
          ¿Aún no eres miembro?{" "}
          <Link
            href="/register"
            className="text-primary font-medium hover:underline transition-all"
          >
            Únete hoy mismo
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
