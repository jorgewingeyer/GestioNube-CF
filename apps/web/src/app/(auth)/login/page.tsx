import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@repo/ui/components/card";
import { LoginForm } from "./components/login-form";
import Link from "next/link";

export default function LoginPage() {
  return (
    <Card className="w-md">
      <CardHeader>
        <CardTitle className="text-2xl">¡Hola de Nuevo!</CardTitle>
        <CardDescription>
          Ingresa tu correo electrónico y contraseña para continuar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
        <div className="mt-4 text-center text-sm">
          ¿Eres nuevo/a aquí?{" "}
          <Link href="/register" className="underline underline-offset-4">
            Crea tu cuenta
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
