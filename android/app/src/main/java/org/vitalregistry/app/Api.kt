package org.vitalregistry.app

import okhttp3.Interceptor
import org.vitalregistry.app.BuildConfig
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*

data class User(val id: String, val email: String, val full_name: String, val role: String)
data class AuthResponse(val token: String, val user: User)
data class Donor(
    val donor_id: String?, val full_name: String?, val date_of_birth: String?, val gender: String?,
    val phone: String?, val address: String?, val city: String?, val state: String?,
    val height_cm: Double?, val weight_kg: Double?, val medical_conditions: String?,
    val medications: String?, val allergies: String?, val blood_group: String?, val donation_type: String?,
    val organs: List<String>?, val consent_given: Boolean?, val consent_signature: String?,
    val emergency_name: String?, val emergency_relation: String?, val emergency_phone: String?,
    val emergency_email: String?, val status: String?, val expires_at: String?
)
data class Card(
    val donorId: String, val fullName: String, val bloodGroup: String, val organs: List<String>,
    val status: String, val expiresAt: String, val networkStatus: String, val qr: String
)
data class Meta(val bloodGroups: List<String>, val organs: List<String>)
data class Note(val subject: String, val body: String, val created_at: String)

interface VitalApi {
    @POST("auth/register") suspend fun register(@Body b: Map<String, String>): AuthResponse
    @POST("auth/login") suspend fun login(@Body b: Map<String, String>): AuthResponse
    @GET("meta") suspend fun meta(): Meta
    @GET("donor") suspend fun donor(): Donor
    @PUT("donor") suspend fun updateDonor(@Body b: Map<String, @JvmSuppressWildcards Any?>): Donor
    @POST("donor/consent") suspend fun consent(@Body b: Map<String, @JvmSuppressWildcards Any>): Donor
    @POST("donor/submit") suspend fun submit(): Donor
    @GET("donor/card") suspend fun card(): Card
    @POST("donor/renew") suspend fun renew(): Donor
    @POST("donor/withdraw") suspend fun withdraw(): Donor
    @GET("notifications") suspend fun notifications(): List<Note>
}

/** Same Express + Supabase backend as the web app. */
object Api {
    @Volatile var token: String? = null

    val service: VitalApi by lazy {
        val client = okhttp3.OkHttpClient.Builder().addInterceptor(Interceptor { chain ->
            val b = chain.request().newBuilder()
            token?.let { b.header("Authorization", "Bearer $it") }
            chain.proceed(b.build())
        }).build()
        Retrofit.Builder().baseUrl(BuildConfig.API_URL).client(client)
            .addConverterFactory(GsonConverterFactory.create()).build().create(VitalApi::class.java)
    }

    /** Extracts the backend's {"error": "..."} message from an HTTP failure. */
    fun message(e: Throwable): String = when (e) {
        is retrofit2.HttpException -> try {
            com.google.gson.JsonParser.parseString(e.response()?.errorBody()?.string()).asJsonObject.get("error").asString
        } catch (_: Exception) { "Request failed (${e.code()})" }
        else -> e.message ?: "Network error"
    }
}
