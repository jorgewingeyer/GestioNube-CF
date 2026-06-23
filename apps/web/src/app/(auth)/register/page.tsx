import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardDescription,
} from "@repo/ui/components/card";
import { RegisterForm } from "./components/register-form";
import Link from "next/link";
import { UserPlus } from "lucide-react";

export default function RegisterPage() {
  return (
    <Card className="w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Únete a Nosotros</CardTitle>
        <CardDescription>
          Completa el siguiente formulario para empezar a disfrutar de nuestros
          servicios.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
        <div className="mt-4 text-center text-sm">
          ¿Ya eres miembro?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Inicia sesión aquí
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
