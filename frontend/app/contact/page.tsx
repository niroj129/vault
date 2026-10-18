import { permanentRedirect } from "next/navigation";

/** Old and guessable URL: the contact form lives on the business page. */
export default function Contact() {
  permanentRedirect("/business");
}
