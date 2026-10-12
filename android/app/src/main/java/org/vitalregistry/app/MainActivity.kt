package org.vitalregistry.app

import android.graphics.BitmapFactory
import android.os.Bundle
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

private val Red = androidx.compose.ui.graphics.Color(0xFFC62839)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(primary = Red)) {
                Surface(Modifier.fillMaxSize()) { Root() }
            }
        }
    }
}

@Composable
fun Root() {
    var loggedIn by remember { mutableStateOf(false) }
    if (!loggedIn) AuthScreen { loggedIn = true } else Home { Api.token = null; loggedIn = false }
}

@Composable
fun AuthScreen(onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var register by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Spacer(Modifier.height(48.dp))
        Text("❤ Vital Registry", style = MaterialTheme.typography.headlineMedium, color = Red)
        Text(if (register) "Create your donor account" else "Login to your donor account")
        if (register) OutlinedTextField(name, { name = it }, label = { Text("Full name") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(pass, { pass = it }, label = { Text("Password (8+ chars)") },
            visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        if (error.isNotEmpty()) Text(error, color = Red)
        Button(enabled = !busy, modifier = Modifier.fillMaxWidth(), onClick = {
            scope.launch {
                busy = true; error = ""
                try {
                    val r = if (register) Api.service.register(mapOf("fullName" to name, "email" to email, "password" to pass))
                    else Api.service.login(mapOf("email" to email, "password" to pass))
                    Api.token = r.token
                    onDone()
                } catch (e: Exception) { error = Api.message(e) }
                busy = false
            }
        }) { Text(if (register) "Register" else "Login") }
        TextButton(onClick = { register = !register }) { Text(if (register) "Have an account? Login" else "New donor? Register") }
    }
}

@Composable
fun Home(onLogout: () -> Unit) {
    var donor by remember { mutableStateOf<Donor?>(null) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val reload: () -> Unit = {
        scope.launch {
            try { donor = Api.service.donor() } catch (e: Exception) { error = Api.message(e) }
        }
    }
    LaunchedEffect(Unit) { reload() }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("❤ Vital Registry", color = Red, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            TextButton(onClick = onLogout) { Text("Logout") }
        }
        val d = donor
        when {
            d == null -> Text(error.ifEmpty { "Loading…" }, Modifier.padding(16.dp))
            d.status == "draft" -> Wizard(d, reload)
            else -> Dashboard(d, reload)
        }
    }
}

private val STEPS = listOf("Personal", "Medical", "Blood & Preferences", "Organs", "Consent", "Emergency Contact", "Verify")
private val CONSENT = "Organ donation can save up to 8 lives. Donation is voluntary and you can modify, renew or withdraw your pledge at any time. " +
    "Registering does not affect the medical care you receive. Your data is stored securely and shared only with authorized organ donation networks.\n\n" +
    "I voluntarily pledge to donate the organs and tissues I have selected and confirm my information is accurate."

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Wizard(initial: Donor, onFinished: () -> Unit) {
    val scope = rememberCoroutineScope()
    var step by remember { mutableIntStateOf(0) }
    var meta by remember { mutableStateOf(Meta(emptyList(), emptyList())) }
    val f = remember { mutableStateMapOf<String, String>() }
    var organs by remember { mutableStateOf(initial.organs ?: emptyList()) }
    var agree by remember { mutableStateOf(initial.consent_given == true) }
    var consented by remember { mutableStateOf(initial.consent_given == true) }
    var error by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        runCatching { meta = Api.service.meta() }
        mapOf(
            "full_name" to initial.full_name, "date_of_birth" to initial.date_of_birth?.take(10), "gender" to initial.gender,
            "phone" to initial.phone, "address" to initial.address, "city" to initial.city, "state" to initial.state,
            "height_cm" to initial.height_cm?.toString(), "weight_kg" to initial.weight_kg?.toString(),
            "medical_conditions" to initial.medical_conditions, "medications" to initial.medications, "allergies" to initial.allergies,
            "blood_group" to initial.blood_group, "donation_type" to initial.donation_type,
            "emergency_name" to initial.emergency_name, "emergency_relation" to initial.emergency_relation,
            "emergency_phone" to initial.emergency_phone, "emergency_email" to initial.emergency_email,
            "signature" to initial.full_name
        ).forEach { (k, v) -> f[k] = v ?: "" }
    }

    fun field(label: String, key: String) = @Composable {
        OutlinedTextField(f[key] ?: "", { f[key] = it }, label = { Text(label) }, modifier = Modifier.fillMaxWidth())
    }
    val keysPerStep = listOf(
        listOf("full_name", "date_of_birth", "gender", "phone", "address", "city", "state"),
        listOf("height_cm", "weight_kg", "medical_conditions", "medications", "allergies"),
        listOf("blood_group", "donation_type"), emptyList(), emptyList(),
        listOf("emergency_name", "emergency_relation", "emergency_phone", "emergency_email"), emptyList()
    )

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Step ${step + 1} of ${STEPS.size}: ${STEPS[step]}", style = MaterialTheme.typography.titleMedium)
        LinearProgressIndicator(progress = { (step + 1f) / STEPS.size }, modifier = Modifier.fillMaxWidth())
        when (step) {
            0 -> { field("Full name", "full_name")(); field("Date of birth (YYYY-MM-DD)", "date_of_birth")()
                field("Gender", "gender")(); field("Phone", "phone")(); field("Address", "address")(); field("City", "city")(); field("State", "state")() }
            1 -> { field("Height (cm)", "height_cm")(); field("Weight (kg)", "weight_kg")()
                field("Medical conditions", "medical_conditions")(); field("Medications", "medications")(); field("Allergies", "allergies")() }
            2 -> {
                Text("Blood group")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    meta.bloodGroups.forEach { b -> FilterChip(f["blood_group"] == b, { f["blood_group"] = b }, label = { Text(b) }) }
                }
                Text("Donation preference")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("after_death" to "After death", "living" to "Living", "both" to "Both").forEach { (k, l) ->
                        FilterChip(f["donation_type"] == k, { f["donation_type"] = k }, label = { Text(l) })
                    }
                }
            }
            3 -> FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                meta.organs.forEach { o ->
                    FilterChip(o in organs, { organs = if (o in organs) organs - o else organs + o }, label = { Text(o) })
                }
            }
            4 -> {
                Text(CONSENT)
                if (consented) Text("✓ Consent recorded", color = Red) else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(agree, { agree = it }); Text("I have read the information and give my consent")
                    }
                    field("Digital signature (full name)", "signature")()
                }
            }
            5 -> { field("Contact name", "emergency_name")(); field("Relationship", "emergency_relation")()
                field("Contact phone", "emergency_phone")(); field("Contact email", "emergency_email")() }
            6 -> {
                Text("Review your details, then confirm to generate your Donor ID, digital card and QR code.")
                Text("Name: ${f["full_name"]}\nBlood group: ${f["blood_group"]}\nOrgans: ${organs.joinToString()}\n" +
                    "Consent: ${if (consented) "Given" else "Missing"}\nEmergency contact: ${f["emergency_name"]} ${f["emergency_phone"]}")
            }
        }
        if (error.isNotEmpty()) Text(error, color = Red)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (step > 0) OutlinedButton(onClick = { step-- }) { Text("Back") }
            Button(enabled = !busy, onClick = {
                scope.launch {
                    busy = true; error = ""
                    try {
                        when (step) {
                            4 -> if (!consented) {
                                Api.service.consent(mapOf("agree" to agree, "signature" to (f["signature"] ?: "")))
                                consented = true
                            }
                            6 -> { Api.service.submit(); onFinished(); return@launch }
                            else -> {
                                val body = mutableMapOf<String, Any?>()
                                keysPerStep[step].forEach { k -> body[k] = f[k] ?: "" }
                                if (step == 3) body["organs"] = organs
                                Api.service.updateDonor(body)
                            }
                        }
                        step++
                    } catch (e: Exception) { error = Api.message(e) }
                    busy = false
                }
            }) { Text(if (step == 6) "Confirm & Generate Card" else "Save & Continue") }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
fun Dashboard(d: Donor, reload: () -> Unit) {
    val scope = rememberCoroutineScope()
    var card by remember { mutableStateOf<Card?>(null) }
    var notes by remember { mutableStateOf<List<Note>>(emptyList()) }
    var msg by remember { mutableStateOf("") }
    LaunchedEffect(d.status) {
        runCatching { card = Api.service.card(); notes = Api.service.notifications() }
    }
    fun act(block: suspend () -> Unit, ok: String) = scope.launch {
        try { block(); msg = ok; reload() } catch (e: Exception) { msg = Api.message(e) }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        card?.let { c ->
            Card(colors = CardDefaults.cardColors(containerColor = Red)) {
                Column(Modifier.padding(20.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("DIGITAL DONOR CARD", color = androidx.compose.ui.graphics.Color.White)
                    Text(c.fullName, style = MaterialTheme.typography.headlineSmall, color = androidx.compose.ui.graphics.Color.White)
                    Text(c.donorId, color = androidx.compose.ui.graphics.Color.White)
                    Spacer(Modifier.height(8.dp))
                    val bytes = Base64.decode(c.qr.substringAfter(","), Base64.DEFAULT)
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.let {
                        Image(it.asImageBitmap(), "Donor QR code", Modifier.size(180.dp))
                    }
                    Text("Blood group ${c.bloodGroup} · ${c.organs.joinToString()}", color = androidx.compose.ui.graphics.Color.White)
                    Text("Status: ${c.status.uppercase()} · valid until ${c.expiresAt.take(10)}", color = androidx.compose.ui.graphics.Color.White)
                    Text(if (c.networkStatus == "linked") "Connected to donation network" else "Not connected", color = androidx.compose.ui.graphics.Color.White)
                }
            }
        }
        if (msg.isNotEmpty()) Text(msg, color = Red)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { act({ Api.service.renew() }, "Pledge renewed.") }) {
                Text(if (d.status == "withdrawn") "Re-activate" else "Renew pledge")
            }
            if (d.status != "withdrawn")
                OutlinedButton(onClick = { act({ Api.service.withdraw() }, "Pledge withdrawn.") }) { Text("Withdraw pledge") }
        }
        Text("Notifications", style = MaterialTheme.typography.titleMedium)
        notes.forEach { n -> Text("• ${n.subject}\n${n.body}") }
        Spacer(Modifier.height(24.dp))
    }
}
