import { useEffect, useState } from "react";
import QRCode from "qrcode";
export function InstallQr() {
  const [image, setImage] = useState("");
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(location.origin + import.meta.env.BASE_URL, {
      width: 280,
      margin: 4,
    })
      .then((url) => {
        if (active) setImage(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <section>
      <h3>QR d’installation</h3>
      <p>
        Ce QR ouvre uniquement l’application, sans programme ni donnée
        individuelle. Il exige une connexion lors de la première ouverture. Une
        adresse locale de développement n’est accessible que depuis son propre
        appareil.
      </p>
      {image && (
        <img
          className="qr"
          src={image}
          alt="QR d’installation de l’application, sans données patient"
        />
      )}
    </section>
  );
}
