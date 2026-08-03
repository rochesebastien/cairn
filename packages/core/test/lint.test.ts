import { describe, expect, it } from "vitest";
import { formatViolations, isAcceptanceClean, lintAcceptance } from "../src/lint.js";

/** Criteria that must be accepted: ordinary user language, EN and FR. */
const CLEAN: string[] = [
  // French
  "L'utilisateur voit son tableau de bord après s'être connecté.",
  "Aujourd'hui, le total du panier s'affiche en euros.",
  "L'employé(e) reçoit une notification par courriel.",
  "Le formulaire refuse un mot de passe de moins de 8 caractères.",
  "Quand le visiteur clique sur « Se connecter », une page de bienvenue apparaît.",
  "Si le paiement échoue, un message d'erreur explique pourquoi et le panier est conservé.",
  "Le prix affiché est 12,50 € toutes taxes comprises.",
  "La liste est triée du plus récent au plus ancien.",
  "L'utilisateur(trice) peut supprimer son compte depuis les réglages.",
  "Une facture au format PDF est envoyée après l'achat.",
  "La page se charge en moins de 2 secondes sur un réseau 3G.",
  "Le nom d'utilisateur ne peut pas dépasser 30 caractères.",
  // English
  "The visitor sees a confirmation message after submitting the form.",
  "A signed-out user is redirected to the sign-in page.",
  "The cart badge shows the number of items. It updates immediately.",
  "The iPhone app and the macOS app show the same list.",
  "The user can drag a card from one column to another.",
  "Prices are shown in the user's local currency (EUR, USD or GBP).",
  "Nothing happens when the user presses Escape twice.",
  "The report can be downloaded as a PDF file.",
  "Node.js is not mentioned anywhere in the interface.",
  "The search box finds a customer by name, e-mail or phone number.",
  "An admin can invite up to 10 team-mates at once.",
  // Adversarial prose: punctuation, numbers, elisions, slashes, brackets
  "Le client reçoit un e-mail de confirmation dans les 5 minutes.",
  "La facture indique le n° de commande et la TVA (20 %).",
  "Après 3 tentatives, le compte est bloqué pendant 15 minutes.",
  "Le taux affiché est de 4.5 % par an.",
  "Il/elle peut modifier son adresse depuis « Mon compte ».",
  "Un utilisateur non connecté ne voit ni le panier ni les commandes.",
  "Le fichier téléchargé s'appelle « facture » suivi de la date.",
  "Une pièce jointe de plus de 10 Mo est refusée.",
  "The user can undo the last action with Ctrl+Z.",
  'The banner reads "Welcome back, Ana!" after sign-in.',
  "The dropdown lists the 3 most recent projects (max. 3).",
  "On the checkout page, taxes appear before the total.",
];

describe("lintAcceptance — no false positives on prose", () => {
  it.each(CLEAN)("accepts %s", (criterion) => {
    const violations = lintAcceptance([criterion]);
    expect(
      violations,
      `unexpected violations: ${JSON.stringify(violations)}`,
    ).toEqual([]);
  });

  it("accepts the whole clean corpus at once", () => {
    expect(isAcceptanceClean(CLEAN)).toBe(true);
    expect(lintAcceptance([])).toEqual([]);
  });
});

describe("lintAcceptance — CSS selectors", () => {
  it("flags id selectors", () => {
    const [violation] = lintAcceptance(["Le bouton #submit-btn devient vert"]);
    expect(violation?.rule).toBe("css-selector");
    expect(violation?.match).toBe("#submit-btn");
  });

  it("flags class selectors", () => {
    const violations = lintAcceptance(["The .cart-badge shows the item count"]);
    expect(violations.map((v) => v.match)).toContain(".cart-badge");
    expect(violations[0]?.rule).toBe("css-selector");
  });

  it("flags attribute selectors", () => {
    const violations = lintAcceptance([
      'The element [data-testid="cart"] is visible',
      "L'élément [aria-label] est présent",
    ]);
    expect(violations.map((v) => v.match)).toEqual([
      '[data-testid="cart"]',
      "[aria-label]",
    ]);
    expect(violations.every((v) => v.rule === "css-selector")).toBe(true);
  });

  it("does not treat a sentence-ending period as a class selector", () => {
    expect(lintAcceptance(["Le panier est vide. Un message l'indique."])).toEqual([]);
    expect(lintAcceptance(["The cart is empty... and it says so."])).toEqual([]);
  });

  it("does not treat decimals or bracketed prose as selectors", () => {
    expect(lintAcceptance(["Le score est de 3.5 sur 5"])).toEqual([]);
    expect(lintAcceptance(["The user sees [see the help page] as a hint"])).toEqual([]);
  });
});

describe("lintAcceptance — HTTP routes", () => {
  it("flags verb + path", () => {
    const violations = lintAcceptance([
      "GET /api/users returns the list",
      "L'application appelle POST /api/panier/ajouter",
    ]);
    expect(violations.map((v) => v.match)).toEqual([
      "GET /api/users",
      "POST /api/panier/ajouter",
    ]);
    expect(violations.every((v) => v.rule === "http-route")).toBe(true);
  });

  it("does not flag ordinary uses of the words", () => {
    expect(lintAcceptance(["The user can get help from the support page"])).toEqual([]);
    expect(lintAcceptance(["L'utilisateur poste un commentaire et/ou une photo"])).toEqual([]);
  });
});

describe("lintAcceptance — identifiers", () => {
  it("flags camelCase identifiers", () => {
    const violations = lintAcceptance(["Le champ userName est obligatoire"]);
    expect(violations[0]?.rule).toBe("identifier");
    expect(violations[0]?.match).toBe("userName");
  });

  it("flags snake_case identifiers", () => {
    const violations = lintAcceptance(["The column created_at is filled in"]);
    expect(violations[0]?.rule).toBe("identifier");
    expect(violations[0]?.match).toBe("created_at");
  });

  it("does not flag French elisions or accented words", () => {
    expect(
      lintAcceptance([
        "L'utilisateur, l'employé et l'administrateur voient la même chose.",
        "Aujourd'hui l'écran affiche la météo.",
      ]),
    ).toEqual([]);
  });

  it("does not flag well-known product names", () => {
    expect(lintAcceptance(["The iPhone, iPad and macOS versions agree"])).toEqual([]);
  });
});

describe("lintAcceptance — file paths", () => {
  it("flags source paths", () => {
    const violations = lintAcceptance(["Le fichier src/panier.ts est mis à jour"]);
    expect(violations[0]?.rule).toBe("file-path");
    expect(violations[0]?.match).toBe("src/panier.ts");
  });

  it("flags bare source file names", () => {
    const violations = lintAcceptance(["The value is read from config.yml"]);
    expect(violations.some((v) => v.rule === "file-path" && v.match === "config.yml")).toBe(true);
  });

  it("does not flag technology names that look like files", () => {
    expect(lintAcceptance(["The app is built with Node.js and Vue.js"])).toEqual([]);
  });

  it("does not flag prose with slashes or ellipses", () => {
    expect(lintAcceptance(["La vitesse est affichée en km/h."])).toEqual([]);
    expect(lintAcceptance(["Le rendez-vous est le 12/03/2026 à 14h."])).toEqual([]);
    expect(lintAcceptance(["L'utilisateur choisit oui/non puis valide."])).toEqual([]);
  });
});

describe("lintAcceptance — function calls", () => {
  it("flags empty-argument calls", () => {
    const violations = lintAcceptance(["Le panier appelle checkout() au clic"]);
    expect(violations.some((v) => v.rule === "function-call")).toBe(true);
    expect(violations.some((v) => v.match === "checkout()")).toBe(true);
  });

  it("flags dotted calls with arguments", () => {
    const violations = lintAcceptance(["The page calls cart.addItem(product) on click"]);
    expect(violations.some((v) => v.rule === "function-call")).toBe(true);
    expect(violations.some((v) => v.match === "cart.addItem(product)")).toBe(true);
  });

  it("flags camelCase calls with arguments", () => {
    const violations = lintAcceptance(["On appelle ajouterAuPanier(article)"]);
    expect(violations.some((v) => v.rule === "function-call")).toBe(true);
  });

  it("does not flag French inclusive writing", () => {
    expect(
      lintAcceptance([
        "L'utilisateur(trice) reçoit un courriel.",
        "Les employé(e)s connecté(e)s voient le bandeau.",
      ]),
    ).toEqual([]);
  });

  it("does not flag ordinary parentheses", () => {
    expect(
      lintAcceptance(["The total (taxes included) is shown at the bottom"]),
    ).toEqual([]);
  });
});

describe("Violation shape", () => {
  it("reports criterion, index, rule, match and message", () => {
    const criteria = [
      "L'utilisateur voit son panier",
      "Le bouton .btn-primary est bleu",
    ];
    const violations = lintAcceptance(criteria);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      criterion: criteria[1],
      index: 1,
      rule: "css-selector",
      match: ".btn-primary",
    });
    expect(violations[0]?.message).toContain(".btn-primary");
    expect(formatViolations(violations)[0]).toContain("[css-selector]");
  });

  it("reports one violation per distinct match and keeps criterion order", () => {
    const violations = lintAcceptance([
      "clean criterion",
      "GET /api/a and POST /api/b",
      "another clean one",
      "the #main element",
    ]);
    expect(violations.map((v) => v.index)).toEqual([1, 1, 3]);
  });

  it("deduplicates a repeated match inside one criterion", () => {
    const violations = lintAcceptance(["userName et userName encore"]);
    expect(violations).toHaveLength(1);
  });

  it("catches a fully technical criterion under several rules", () => {
    const violations = lintAcceptance([
      "POST /api/cart adds the item, then src/cart.ts calls cart.addItem(id) and #cart-count updates",
    ]);
    const rules = new Set(violations.map((v) => v.rule));
    expect(rules.has("http-route")).toBe(true);
    expect(rules.has("file-path")).toBe(true);
    expect(rules.has("function-call")).toBe(true);
    expect(rules.has("css-selector")).toBe(true);
    expect(isAcceptanceClean(["POST /api/cart"])).toBe(false);
  });

  it.each([
    ["Le test vérifie que #app .cart-item existe", "css-selector"],
    ["appeler POST /login puis GET /me", "http-route"],
    ["la fonction handleSubmit() est déclenchée", "function-call"],
    ["le champ isLoggedIn passe à true", "identifier"],
    ["on met à jour packages/web/src/cart.tsx", "file-path"],
    ["le sélecteur [data-cy=submit] est cliqué", "css-selector"],
  ])("catches implementation leakage in %s", (criterion, rule) => {
    const violations = lintAcceptance([criterion]);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.map((v) => v.rule)).toContain(rule);
  });
});
